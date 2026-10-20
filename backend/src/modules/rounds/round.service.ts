import { assertActiveParticipant } from '../auth/auth.domain.ts';
import { getDb } from '../../db/client.ts';
import { auditService, type AuditService } from '../audit/audit.service.ts';
import { eventRepository, type IEventRepository } from '../events/event.repository.ts';
import { roundRepository, type IRoundRepository } from './round.repository.ts';
import {
  assertCanConfigureRound,
  assertCanResumeRound,
  assertCanStartRound,
  assertValidRoundTransition,
  getDefaultPatternConfigs,
  validatePatternConfigs,
  validateRoundReadiness,
} from './round.domain.ts';
import type {
  CreateRoundInput,
  RoundListResult,
  RoundStatus,
  RoundSummary,
  UpdateRoundInput,
} from './round.types.ts';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/app-error.ts';
import { idempotencyRepository, type IIdempotencyRepository } from '../../shared/idempotency/idempotency.repository.ts';
import type { RealtimeEvent } from '../../realtime/events.ts';

export interface IRealtimePublisher {
  broadcastCommitted(event: RealtimeEvent): Promise<void>;
}

export class RoundService {
  constructor(
    private readonly repo: IRoundRepository = roundRepository,
    private readonly eventRepo: IEventRepository = eventRepository,
    private readonly audit: AuditService = auditService,
    private readonly idempotency: IIdempotencyRepository = idempotencyRepository,
    private realtime?: IRealtimePublisher
  ) {}

  setRealtimePublisher(publisher: IRealtimePublisher): void {
    this.realtime = publisher;
  }

  async createRound(
    actorId: string,
    input: CreateRoundInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RoundSummary> {
    const event = await this.eventRepo.findById(input.eventId);
    if (!event) {
      throw new NotFoundError(`Event with id '${input.eventId}' not found`);
    }

    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
      throw new ConflictError(
        `Cannot create rounds in an event with status '${event.status}'`,
        'EVENT_IMMUTABLE'
      );
    }

    const existingSeq = await this.repo.findByEventAndSequence(
      input.eventId,
      input.sequenceNumber
    );
    if (existingSeq) {
      throw new ConflictError(
        `Round sequence number ${input.sequenceNumber} already exists in this event`,
        'DUPLICATE_ROUND_SEQUENCE'
      );
    }

    const patterns = input.patterns && input.patterns.length > 0
      ? input.patterns
      : getDefaultPatternConfigs();

    validatePatternConfigs(patterns);

    const db = getDb();
    let created: RoundSummary;

    await db.transaction(async (tx) => {
      created = await this.repo.create(
        {
          eventId: input.eventId,
          sequenceNumber: input.sequenceNumber,
          name: input.name.trim(),
          status: 'DRAFT',
        },
        patterns,
        tx
      );

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_STARTED', // PRD lifecycle audit action
          resourceType: 'round',
          resourceId: created.id,
          metadata: {
            eventId: created.eventId,
            sequenceNumber: created.sequenceNumber,
            name: created.name,
            patternCount: created.patterns.length,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return created!;
  }

  async getRoundById(id: string): Promise<RoundSummary> {
    const round = await this.repo.findById(id);
    if (!round) {
      throw new NotFoundError(`Round with id '${id}' not found`);
    }
    return round;
  }

  async listRounds(
    page = 1,
    limit = 20,
    eventId?: string,
    status?: RoundStatus
  ): Promise<RoundListResult> {
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit));

    const { data, total } = await this.repo.list({
      page: validPage,
      limit: validLimit,
      eventId,
      status,
    });

    return {
      data,
      pagination: {
        page: validPage,
        limit: validLimit,
        total,
        totalPages: Math.ceil(total / validLimit) || 1,
      },
    };
  }

  async updateRound(
    actorId: string,
    id: string,
    input: UpdateRoundInput,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RoundSummary> {
    const existing = await this.getRoundById(id);

    // Assert that configuration can only be changed while DRAFT
    assertCanConfigureRound(existing.status);

    const roundData: Record<string, any> = {};

    if (input.name !== undefined) {
      roundData.name = input.name.trim();
    }

    if (input.sequenceNumber !== undefined && input.sequenceNumber !== existing.sequenceNumber) {
      const conflict = await this.repo.findByEventAndSequence(
        existing.eventId,
        input.sequenceNumber
      );
      if (conflict && conflict.id !== id) {
        throw new ConflictError(
          `Round sequence number ${input.sequenceNumber} already exists in this event`,
          'DUPLICATE_ROUND_SEQUENCE'
        );
      }
      roundData.sequenceNumber = input.sequenceNumber;
    }

    if (input.patterns !== undefined) {
      validatePatternConfigs(input.patterns);
    }

    const db = getDb();
    let updated: RoundSummary;

    await db.transaction(async (tx) => {
      updated = await this.repo.update(id, roundData, input.patterns, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_PAUSED', // configuration audit
          resourceType: 'round',
          resourceId: id,
          metadata: {
            updates: input,
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }

  async readyRound(
    actorId: string,
    roundId: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<RoundSummary> {
    const db = getDb();
    let updated: RoundSummary;

    await db.transaction(async (tx) => {
      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      const metrics = await this.repo.getReadinessMetrics(round.id, round.eventId, tx);
      const enabledPatternCount = round.patterns.filter((p) => p.enabled).length;

      validateRoundReadiness({
        status: round.status,
        enabledPatternCount,
        questionCount: metrics.questionCount,
        activeParticipantsCount: metrics.activeParticipantsCount,
        ticketsCount: metrics.ticketsCount,
      });

      updated = await this.repo.update(round.id, { status: 'READY' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_STARTED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'READY',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return updated!;
  }

  async startRound(
    actorId: string,
    roundId: string,
    idempotencyKey?: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ round: RoundSummary }> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for round start');
    }
    const trimmedKey = idempotencyKey.trim();

    const cached = await this.idempotency.find(trimmedKey);
    if (cached) {
      return cached;
    }

    const db = getDb();
    let updatedRound: RoundSummary;

    await db.transaction(async (tx) => {
      await this.repo.acquireGlobalActiveLock(tx);

      const activeRound = await this.repo.findActiveRound(tx);
      if (activeRound && activeRound.id !== roundId) {
        throw new ConflictError(
          'Another round is currently ACTIVE. Only one round can be ACTIVE globally.',
          'ROUND_ALREADY_ACTIVE'
        );
      }

      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      assertCanStartRound(round.status);

      const event = await this.eventRepo.findById(round.eventId, tx);
      if (!event) {
        throw new NotFoundError(`Event with id '${round.eventId}' not found`);
      }

      if (event.status === 'READY') {
        await this.eventRepo.update(
          event.id,
          { status: 'LIVE', startedAt: event.startedAt || new Date() },
          tx
        );
        await this.audit.record(
          {
            actorId,
            actorType: 'ADMIN',
            action: 'ROUND_STARTED',
            resourceType: 'event',
            resourceId: event.id,
            metadata: {
              title: event.title,
              fromStatus: 'READY',
              toStatus: 'LIVE',
              promotedByRoundId: round.id,
            },
            ip: context?.ip,
            userAgent: context?.userAgent,
            requestId: context?.requestId,
          },
          tx
        );
      } else if (event.status === 'LIVE') {
        // Already live, permitted
      } else {
        throw new ConflictError(
          `Cannot start round because event is in '${event.status}' status. Event must be READY or LIVE.`,
          'INVALID_EVENT_STATUS'
        );
      }

      updatedRound = await this.repo.update(round.id, { status: 'ACTIVE' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_STARTED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'ACTIVE',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );

      const responsePayload = { round: updatedRound };
      await this.idempotency.save(trimmedKey, 'round_start', responsePayload, tx);
    });

    try {
      await this.realtime?.broadcastCommitted({
        type: 'ROUND_STARTED',
        eventId: updatedRound!.eventId,
        roundId: updatedRound!.id,
        occurredAt: new Date().toISOString(),
        payload: { status: 'ACTIVE' },
      });
    } catch {
      // Broadcast failure after commit must not fail the HTTP request
    }

    return { round: updatedRound! };
  }

  async pauseRound(
    actorId: string,
    roundId: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ round: RoundSummary }> {
    const db = getDb();
    let updatedRound: RoundSummary;

    await db.transaction(async (tx) => {
      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      assertValidRoundTransition(round.status, 'PAUSED');

      updatedRound = await this.repo.update(round.id, { status: 'PAUSED' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_PAUSED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'PAUSED',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    try {
      await this.realtime?.broadcastCommitted({
        type: 'ROUND_PAUSED',
        eventId: updatedRound!.eventId,
        roundId: updatedRound!.id,
        occurredAt: new Date().toISOString(),
        payload: { status: 'PAUSED' },
      });
    } catch {
      // Broadcast failure after commit must not fail the HTTP request
    }

    return { round: updatedRound! };
  }

  async resumeRound(
    actorId: string,
    roundId: string,
    idempotencyKey?: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ round: RoundSummary }> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for round resume');
    }
    const trimmedKey = idempotencyKey.trim();

    const cached = await this.idempotency.find(trimmedKey);
    if (cached) {
      return cached;
    }

    const db = getDb();
    let updatedRound: RoundSummary;

    await db.transaction(async (tx) => {
      await this.repo.acquireGlobalActiveLock(tx);

      const activeRound = await this.repo.findActiveRound(tx);
      if (activeRound && activeRound.id !== roundId) {
        throw new ConflictError(
          'Another round is currently ACTIVE. Only one round can be ACTIVE globally.',
          'ROUND_ALREADY_ACTIVE'
        );
      }

      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      assertCanResumeRound(round.status);

      const event = await this.eventRepo.findById(round.eventId, tx);
      if (!event) {
        throw new NotFoundError(`Event with id '${round.eventId}' not found`);
      }

      if (event.status !== 'LIVE') {
        throw new ConflictError(
          `Cannot resume round because event is in '${event.status}' status. Event must be LIVE.`,
          'INVALID_EVENT_STATUS'
        );
      }

      updatedRound = await this.repo.update(round.id, { status: 'ACTIVE' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_RESUMED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'ACTIVE',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );

      const responsePayload = { round: updatedRound };
      await this.idempotency.save(trimmedKey, 'round_resume', responsePayload, tx);
    });

    try {
      await this.realtime?.broadcastCommitted({
        type: 'ROUND_RESUMED',
        eventId: updatedRound!.eventId,
        roundId: updatedRound!.id,
        occurredAt: new Date().toISOString(),
        payload: { status: 'ACTIVE' },
      });
    } catch {
      // Broadcast failure after commit must not fail the HTTP request
    }

    return { round: updatedRound! };
  }

  async completeRound(
    actorId: string,
    roundId: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ round: RoundSummary }> {
    const db = getDb();
    let updatedRound: RoundSummary;

    await db.transaction(async (tx) => {
      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      assertValidRoundTransition(round.status, 'COMPLETED');

      updatedRound = await this.repo.update(round.id, { status: 'COMPLETED' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_COMPLETED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'COMPLETED',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    try {
      await this.realtime?.broadcastCommitted({
        type: 'ROUND_COMPLETED',
        eventId: updatedRound!.eventId,
        roundId: updatedRound!.id,
        occurredAt: new Date().toISOString(),
        payload: { status: 'COMPLETED' },
      });
    } catch {
      // Broadcast failure after commit must not fail the HTTP request
    }

    return { round: updatedRound! };
  }

  async cancelRound(
    actorId: string,
    roundId: string,
    context?: { ip?: string; userAgent?: string; requestId?: string }
  ): Promise<{ round: RoundSummary }> {
    const db = getDb();
    let updatedRound: RoundSummary;

    await db.transaction(async (tx) => {
      const round = await this.repo.findById(roundId, tx);
      if (!round) {
        throw new NotFoundError(`Round with id '${roundId}' not found`);
      }

      assertValidRoundTransition(round.status, 'CANCELLED');

      updatedRound = await this.repo.update(round.id, { status: 'CANCELLED' }, undefined, tx);

      await this.audit.record(
        {
          actorId,
          actorType: 'ADMIN',
          action: 'ROUND_COMPLETED',
          resourceType: 'round',
          resourceId: round.id,
          metadata: {
            eventId: round.eventId,
            sequenceNumber: round.sequenceNumber,
            fromStatus: round.status,
            toStatus: 'CANCELLED',
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        },
        tx
      );
    });

    return { round: updatedRound! };
  }

  async getCurrentRoundForParticipant(userId: string, eventId: string, sessionId?: string): Promise<RoundSummary> {
    if (sessionId) {
      const read = await this.repo.findCurrentRoundForSession(sessionId, userId, eventId);
      if (!read) throw new UnauthorizedError('Authentication required');
      assertActiveParticipant(read);
      if (!read.round) throw new NotFoundError('No current round found for this event');
      return read.round;
    }

    const current = await this.repo.findCurrentRoundForParticipant(userId, eventId);
    if (!current) {
      throw new NotFoundError('No current round found for this event');
    }
    return current;
  }

  async getParticipantEvent(eventId: string) {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw new NotFoundError(`Event with id '${eventId}' not found`);
    }
    return event;
  }
}

export const roundService = new RoundService();
