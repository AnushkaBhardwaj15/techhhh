import { assertActiveParticipant } from '../auth/auth.domain.ts';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { participantProfiles } from '../../db/schema/users.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../shared/errors/index.ts';
import type { AuditService } from '../audit/audit.service.ts';
import type { IRoundRepository } from '../rounds/round.repository.ts';
import type { IIdempotencyRepository } from '../../shared/idempotency/idempotency.repository.ts';
import { generateTicketLayout, computeTicketFingerprint, type TicketKey } from './ticket.domain.ts';
import type {
  GenerateTicketsResult,
  ITicketRepository,
  TicketDto,
} from './ticket.types.ts';

export class TicketService {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly roundRepo: IRoundRepository,
    private readonly auditService: AuditService,
    private readonly idempotencyRepo?: IIdempotencyRepository
  ) {}

  async generateTickets(params: {
    roundId: string;
    actorId: string;
    idempotencyKey?: string;
    rng?: () => number;
  }): Promise<GenerateTicketsResult> {
    const { roundId, actorId, idempotencyKey, rng } = params;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      throw new ValidationError('Idempotency-Key header is required for ticket generation');
    }

    // 1. Idempotency Check
    if (this.idempotencyRepo) {
      const cached = await this.idempotencyRepo.find(idempotencyKey.trim());
      if (cached) {
        return cached as GenerateTicketsResult;
      }
    }

    // 2. Fetch Round
    const round = await this.roundRepo.findById(roundId);
    if (!round) {
      throw new NotFoundError('Round not found');
    }

    // 3. Immutability validation: tickets can only be generated when round is in DRAFT status
    if (round.status !== 'DRAFT') {
      throw new ConflictError(
        `Cannot generate tickets for round in status ${round.status}. Tickets are immutable once round is READY or active.`
      );
    }

    // 4. Fetch Round's eligible Keys
    const keys: TicketKey[] = await this.ticketRepo.getRoundKeys(roundId);
    if (keys.length < 15) {
      throw new ValidationError(
        `Round requires at least 15 eligible keys to generate tickets, but only ${keys.length} found`
      );
    }

    // 5. Fetch all Participants in the Round's Event
    const db = getDb();
    const allParticipants = await db
      .select({
        id: participantProfiles.id,
        status: participantProfiles.status,
      })
      .from(participantProfiles)
      .where(eq(participantProfiles.eventId, round.eventId));

    const activeParticipants = allParticipants.filter((p: { id: string; status: string }) => p.status === 'ACTIVE');
    const skipped = allParticipants.length - activeParticipants.length;

    // 6. Check existing tickets for this Round
    const existingTicketParticipantIds = await this.ticketRepo.findExistingTicketParticipantIds(roundId);

    const toGenerate: Array<{ id: string; status: string }> = [];
    let existing = 0;

    for (const p of activeParticipants) {
      if (existingTicketParticipantIds.has(p.id)) {
        existing++;
      } else {
        toGenerate.push(p);
      }
    }

    // If nothing to generate, still record idempotency and return
    if (toGenerate.length === 0) {
      const result: GenerateTicketsResult = {
        roundId,
        totalParticipants: allParticipants.length,
        created: 0,
        existing,
        skipped,
      };

      if (this.idempotencyRepo) {
        await this.idempotencyRepo.save(
          idempotencyKey.trim(),
          'TICKET_GENERATE',
          result
        );
      }

      return result;
    }

    // 7. Atomic transaction: generate and persist tickets + cells + audit log
    await db.transaction(async (tx) => {
      const existingFingerprints = new Set<string>();

      for (const participant of toGenerate) {
        let layout: ReturnType<typeof generateTicketLayout> | null = null;

        for (let attempt = 0; attempt < 10; attempt++) {
          const candidate = generateTicketLayout({
            keys,
            rng,
          });
          const fp = computeTicketFingerprint(candidate.cells.map((c) => c.keyId));
          if (!existingFingerprints.has(fp)) {
            layout = candidate;
            existingFingerprints.add(fp);
            break;
          }
        }

        if (!layout) {
          layout = generateTicketLayout({ keys, rng });
        }

        await this.ticketRepo.createTicketWithCells(
          {
            roundId,
            participantId: participant.id,
            eventId: round.eventId,
            cells: layout.cells,
          },
          tx
        );
      }

      await this.auditService.record(
        {
          action: 'TICKET_GENERATED',
          actorId,
          actorType: 'ADMIN',
          resourceType: 'ROUND',
          resourceId: roundId,
          metadata: {
            created: toGenerate.length,
            existing,
            skipped,
          },
        },
        tx
      );
    });

    const result: GenerateTicketsResult = {
      roundId,
      totalParticipants: allParticipants.length,
      created: toGenerate.length,
      existing,
      skipped,
    };

    if (this.idempotencyRepo) {
      await this.idempotencyRepo.save(
        idempotencyKey.trim(),
        'TICKET_GENERATE',
        result
      );
    }

    return result;
  }

  async getParticipantTicket(
    userId: string,
    roundId?: string,
    participant?: { id: string; eventId: string; status: string },
    sessionId?: string,
    eventId?: string
  ): Promise<TicketDto> {
    let ticket;
    if (roundId) {
      if (sessionId) {
        if (!eventId) throw new NotFoundError('No event associated with this participant');
        const read = await this.ticketRepo.findBySessionAndRound(sessionId, userId, roundId, eventId);
        if (!read) throw new UnauthorizedError('Authentication required');
        assertActiveParticipant({ ...read, profileStatus: read.profile?.status ?? null });
        if (!read.roundFound) throw new NotFoundError('Round not found in event');
        ticket = read.ticket;
      } else {
        ticket = await this.ticketRepo.findByUserAndRound(userId, roundId);
      }
    } else if (sessionId) {
      if (!eventId) throw new NotFoundError('No event associated with this participant');
      const current = await this.roundRepo.findCurrentRoundForSession(sessionId, userId, eventId);
      if (!current) throw new UnauthorizedError('Authentication required');
      assertActiveParticipant(current);
      if (!current.round) throw new NotFoundError('No current round found for this event');

      const read = await this.ticketRepo.findBySessionAndRound(sessionId, userId, current.round.id, eventId);
      if (!read?.ticket) throw new NotFoundError('Ticket not found for the current round');
      ticket = read.ticket;
    } else {
      const db = getDb();
      const profile = participant ?? (await db
        .select({
          id: participantProfiles.id,
          eventId: participantProfiles.eventId,
          status: participantProfiles.status,
        })
        .from(participantProfiles)
        .where(eq(participantProfiles.userId, userId))
        .limit(1))[0];

      if (!profile) throw new NotFoundError('Participant profile not found');
      if (profile.status !== 'ACTIVE') throw new ForbiddenError('Participant account is inactive');

      // Find current round for the participant's event (priority: ACTIVE, PAUSED, then READY)
      const currentRounds = await db
        .select({
          id: rounds.id,
          status: rounds.status,
          sequenceNumber: rounds.sequenceNumber,
        })
        .from(rounds)
        .where(
          and(
            eq(rounds.eventId, profile.eventId),
            inArray(rounds.status, ['ACTIVE', 'PAUSED', 'READY'])
          )
        )
        .orderBy(desc(rounds.updatedAt));

      if (currentRounds.length === 0) {
        throw new NotFoundError('No current round found for this event');
      }

      // Pick ACTIVE or PAUSED first if exists, else READY
      const activeOrPaused = currentRounds.find((r: { status: string }) => r.status === 'ACTIVE' || r.status === 'PAUSED');
      const targetRoundId = (activeOrPaused || currentRounds[0]!).id;
      ticket = await this.ticketRepo.findByParticipantAndRound(profile.id, targetRoundId);
    }

    if (!ticket) {
      throw new NotFoundError('Ticket not found for the current round');
    }

    return {
      id: ticket.id,
      roundId: ticket.roundId,
      participantId: ticket.participantId,
      eventId: ticket.eventId,
      createdAt: ticket.createdAt.toISOString(),
      cells: ticket.cells.map((c) => ({
        id: c.id,
        rowIndex: c.rowIndex,
        colIndex: c.colIndex,
        row: c.rowIndex,
        column: c.colIndex,
        keyId: c.keyId,
        keyValue: c.keyValue,
        marked: c.marked,
      })),
    };
  }

  async listTicketsForRound(
    roundId: string,
    options: { page: number; limit: number }
  ) {
    const round = await this.roundRepo.findById(roundId);
    if (!round) {
      throw new NotFoundError('Round not found');
    }

    return this.ticketRepo.listTicketsForRound(roundId, options);
  }

  async getTicketById(
    ticketId: string,
    actor: { userId: string; role: string }
  ): Promise<TicketDto> {
    const ticket = await this.ticketRepo.findTicketById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    if (actor.role === 'PARTICIPANT') {
      const db = getDb();
      const [profile] = await db
        .select({ id: participantProfiles.id })
        .from(participantProfiles)
        .where(eq(participantProfiles.userId, actor.userId))
        .limit(1);

      if (!profile || profile.id !== ticket.participantId) {
        throw new ForbiddenError('Access denied: ticket belongs to another participant');
      }
    }

    return {
      id: ticket.id,
      roundId: ticket.roundId,
      participantId: ticket.participantId,
      eventId: ticket.eventId,
      createdAt: ticket.createdAt.toISOString(),
      cells: ticket.cells.map((c) => ({
        id: c.id,
        rowIndex: c.rowIndex,
        colIndex: c.colIndex,
        row: c.rowIndex,
        column: c.colIndex,
        keyId: c.keyId,
        keyValue: c.keyValue,
        marked: false,
      })),
    };
  }
}

import { TicketRepository } from './ticket.repository.ts';
import { roundRepository } from '../rounds/round.repository.ts';
import { auditService } from '../audit/audit.service.ts';
import { idempotencyRepository } from '../../shared/idempotency/idempotency.repository.ts';

export const ticketRepository = new TicketRepository();
export const ticketService = new TicketService(
  ticketRepository,
  roundRepository,
  auditService,
  idempotencyRepository
);
