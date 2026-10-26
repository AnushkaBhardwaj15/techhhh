import { getDb } from '../../db/client.ts';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../shared/errors/index.ts';
import type { AuditService } from '../audit/audit.service.ts';
import { auditService } from '../audit/audit.service.ts';
import type { IRoundRepository } from '../rounds/round.repository.ts';
import { roundRepository } from '../rounds/round.repository.ts';
import type { ITicketRepository } from '../tickets/ticket.types.ts';
import { ticketRepository } from '../tickets/ticket.repository.ts';
import type { IDrawRepository } from '../draws/draw.repository.ts';
import { drawRepository } from '../draws/draw.repository.ts';
import { claimRepository, type IClaimRepository } from './claim.repository.ts';
import { participantRepository } from '../participants/participant.repository.ts';
import {
  evaluatePattern,
  validatePatternEligibility,
  validateRoundActiveForClaim,
  type WinningPatternType,
} from './winner.domain.ts';

export interface ClaimDto {
  id: string;
  roundId: string;
  participantId: string;
  ticketId: string;
  patternType: string;
  status: string;
  createdAt: string;
}

export interface RealtimePublisher {
  broadcastCommitted(event: any): Promise<void>;
}

export class ClaimService {
  private realtimePublisher?: RealtimePublisher;

  constructor(
    private readonly claimRepo: IClaimRepository = claimRepository,
    private readonly roundRepo: IRoundRepository = roundRepository,
    private readonly ticketRepo: ITicketRepository = ticketRepository,
    private readonly drawRepo: IDrawRepository = drawRepository,
    private readonly audit: AuditService = auditService
  ) {}

  setRealtimePublisher(publisher: RealtimePublisher): void {
    this.realtimePublisher = publisher;
  }

  async submitClaim(params: {
    userId: string;
    eventId: string;
    roundId: string;
    pattern: WinningPatternType;
  }): Promise<{ claim: ClaimDto }> {
    const { userId, eventId, roundId, pattern } = params;
    const db = getDb();

    // 1. Resolve Participant Profile and User
    const profile = await participantRepository.findByUserIdAndEvent(userId, eventId);
    if (!profile) {
      throw new NotFoundError('Participant profile not found');
    }
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenError('Participant account is inactive');
    }

    // 2. Fetch Round & Assert ACTIVE
    const round = await this.roundRepo.findById(roundId);
    if (!round) {
      throw new NotFoundError('Round not found');
    }
    if (round.eventId !== eventId) throw new NotFoundError('Round not found');
    validateRoundActiveForClaim(round.status);

    // 3. Fetch Pattern Configuration & Assert Enabled and OPEN
    const patternConfig = await this.claimRepo.getRoundPattern(roundId, pattern);
    if (!patternConfig) {
      throw new ConflictError('Pattern is not configured for this round', 'PATTERN_NOT_FOUND');
    }
    validatePatternEligibility(patternConfig);

    // 4. Resolve Participant's Ticket in this Round (Client cannot nominate ticket)
    const ticket = await this.ticketRepo.findByParticipantAndRound(profile.id, roundId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found for participant in this round');
    }

    // 5. Check if claim already exists
    const existingClaim = await this.claimRepo.findExistingClaim(roundId, profile.id, pattern);
    if (existingClaim) {
      if (existingClaim.status === 'VERIFIED') {
        throw new ConflictError(
          'A claim for this pattern has already been awarded to this participant',
          'CLAIM_ALREADY_EXISTS'
        );
      }
      if (existingClaim.status === 'PENDING_VERIFICATION') {
        throw new ConflictError(
          'A claim for this pattern has already been submitted and is pending verification',
          'CLAIM_ALREADY_EXISTS'
        );
      }
      // If previous status was REJECTED, participant is allowed to re-claim once eligible
    }

    // 6. Recalculate Eligibility Server-Side from Official Draws + Ticket Layout
    const drawnKeyIds = await this.drawRepo.getDrawnKeyIds(roundId);
    const cells = ticket.cells.map((c) => ({
      rowIndex: c.rowIndex,
      colIndex: c.colIndex,
      keyId: c.keyId,
    }));

    const isEligible = evaluatePattern(pattern, cells, drawnKeyIds);
    if (!isEligible) {
      throw new UnprocessableEntityError(
        `Ticket does not satisfy the requirements for winning pattern ${pattern}. Please ensure all required keys for this pattern have been drawn.`,
        'CLAIM_INELIGIBLE'
      );
    }

    // 7. Persist Claim inside Transaction
    const claim = await db.transaction(async (tx) => {
      let created: any;
      if (existingClaim && existingClaim.status.startsWith('REJECTED')) {
        created = await this.claimRepo.updateStatus(
          existingClaim.id,
          { status: 'PENDING_VERIFICATION', rejectionReason: null },
          tx
        );
      } else {
        created = await this.claimRepo.create(
          {
            roundId,
            participantId: profile.id,
            ticketId: ticket.id,
            patternType: pattern,
            status: 'PENDING_VERIFICATION',
          },
          tx
        );
      }

      await this.audit.record(
        {
          actorId: userId,
          actorType: 'PARTICIPANT',
          action: 'WIN_CLAIM_CREATED',
          resourceType: 'CLAIM',
          resourceId: created.id,
          metadata: {
            roundId,
            patternType: pattern,
            ticketId: ticket.id,
            participantId: profile.id,
            participantName: profile.name,
            actorEmail: (profile as any).email ?? null,
            resourceName: `Pattern: ${pattern}`,
          },
        },
        tx
      );

      return created;
    });

    // 8. Post-Commit Real-Time Broadcast (Admin-only audience)
    if (this.realtimePublisher) {
      try {
        await this.realtimePublisher.broadcastCommitted({
          type: 'WIN_CLAIM_CREATED',
          eventId: round.eventId,
          roundId: round.id,
          occurredAt: new Date().toISOString(),
          payload: {
            claimId: claim.id,
            participantName: profile.name,
            pattern,
          },
        });
      } catch (err) {
        console.error('Failed to broadcast WIN_CLAIM_CREATED event:', err);
      }
    }

    return {
      claim: {
        id: claim.id,
        roundId: claim.roundId,
        participantId: claim.participantId,
        ticketId: claim.ticketId,
        patternType: claim.patternType,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
      },
    };
  }

  async listParticipantClaims(
    userId: string,
    eventId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ data: ClaimDto[]; total: number; page: number; limit: number }> {
    const profile = await participantRepository.findByUserIdAndEvent(userId, eventId);
    const participantId = profile?.id ?? userId;

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));

    let { data, total } = await this.claimRepo.listByParticipant(participantId, {
      page,
      limit,
    });

    if (!data.length && profile?.id && profile.id !== userId) {
      const fallback = await this.claimRepo.listByParticipant(userId, { page, limit });
      if (fallback.data.length > 0) {
        data = fallback.data;
        total = fallback.total;
      }
    }

    return {
      data: data.map((c) => ({
        id: c.id,
        roundId: c.roundId,
        participantId: c.participantId,
        ticketId: c.ticketId,
        patternType: c.patternType,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }
}

export const claimService = new ClaimService();
