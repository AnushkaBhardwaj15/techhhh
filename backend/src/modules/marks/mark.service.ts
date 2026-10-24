import { ForbiddenError, NotFoundError } from '../../shared/errors/index.ts';
import type { AuditService } from '../audit/audit.service.ts';
import { auditService } from '../audit/audit.service.ts';
import type { IRoundRepository } from '../rounds/round.repository.ts';
import { roundRepository } from '../rounds/round.repository.ts';
import type { IDrawRepository } from '../draws/draw.repository.ts';
import { drawRepository } from '../draws/draw.repository.ts';
import { markRepository, type IMarkRepository } from './mark.repository.ts';
import { participantRepository } from '../participants/participant.repository.ts';
import {
  assertCellBelongsToTicket,
  assertTicketOwnership,
  validateCellEligibleForMark,
  validateRoundActiveForMark,
} from './mark.domain.ts';

export interface MarkDto {
  id: string;
  ticketId: string;
  cellId: string;
  markedAt: string;
}

export class MarkService {
  constructor(
    private readonly markRepo: IMarkRepository = markRepository,
    private readonly roundRepo: IRoundRepository = roundRepository,
    private readonly drawRepo: IDrawRepository = drawRepository,
    private readonly audit: AuditService = auditService
  ) {}

  async markCell(params: {
    userId: string;
    eventId: string;
    ticketId: string;
    cellId: string;
  }): Promise<{ mark: MarkDto }> {
    const { userId, eventId, ticketId, cellId } = params;

    // 1. Resolve Participant Profile
    const profile = await participantRepository.findByUserIdAndEvent(userId, eventId);

    if (!profile) {
      throw new NotFoundError('Participant profile not found');
    }
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenError('Participant account is inactive');
    }

    // 2. Fetch Ticket & Assert Ownership
    const ticket = await this.markRepo.getTicket(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    assertTicketOwnership(ticket, profile.id);
    if (ticket.eventId !== eventId) throw new NotFoundError('Ticket not found');

    // 3. Fetch Round & Assert ACTIVE
    const round = await this.roundRepo.findById(ticket.roundId);
    if (!round) {
      throw new NotFoundError('Round not found');
    }
    validateRoundActiveForMark(round.status);

    // 4. Fetch Cell & Assert Belongs to Ticket
    const cell = await this.markRepo.getCell(cellId);
    if (!cell) {
      throw new NotFoundError('Cell not found');
    }
    assertCellBelongsToTicket(cell, ticket.id);

    // 5. Assert Cell is Populated
    validateCellEligibleForMark(cell);

    // 6. Create or Get Mark
    const { mark, created } = await this.markRepo.createMark(ticketId, cellId);

    // 7. Audit only if actually newly created
    if (created) {
      await this.audit.record({
        actorId: userId,
        actorType: 'PARTICIPANT',
        action: 'MARK_CREATED',
        resourceType: 'TICKET_MARK',
        resourceId: mark.id,
        metadata: {
          ticketId,
          cellId,
          roundId: round.id,
          keyId: cell.keyId,
          actorEmail: profile.email,
          resourceName: 'Ticket cell mark',
        },
      });
    }

    return {
      mark: {
        id: mark.id,
        ticketId: mark.ticketId,
        cellId: mark.cellId,
        markedAt: mark.markedAt.toISOString(),
      },
    };
  }

  async unmarkCell(params: {
    userId: string;
    eventId: string;
    ticketId: string;
    cellId: string;
  }): Promise<{ success: boolean }> {
    const { userId, eventId, ticketId, cellId } = params;

    // 1. Resolve Participant Profile
    const profile = await participantRepository.findByUserIdAndEvent(userId, eventId);

    if (!profile) {
      throw new NotFoundError('Participant profile not found');
    }
    if (profile.status !== 'ACTIVE') {
      throw new ForbiddenError('Participant account is inactive');
    }

    // 2. Fetch Ticket & Assert Ownership
    const ticket = await this.markRepo.getTicket(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }
    assertTicketOwnership(ticket, profile.id);
    if (ticket.eventId !== eventId) throw new NotFoundError('Ticket not found');

    // 3. Fetch Round & Assert ACTIVE
    const round = await this.roundRepo.findById(ticket.roundId);
    if (!round) {
      throw new NotFoundError('Round not found');
    }
    validateRoundActiveForMark(round.status);

    // 4. Fetch Cell & Assert Belongs to Ticket
    const cell = await this.markRepo.getCell(cellId);
    if (!cell) {
      throw new NotFoundError('Cell not found');
    }
    assertCellBelongsToTicket(cell, ticket.id);

    // 5. Delete Mark
    const deleted = await this.markRepo.deleteMark(ticketId, cellId);

    // 6. Audit only if actually deleted
    if (deleted) {
      await this.audit.record({
        actorId: userId,
        actorType: 'PARTICIPANT',
        action: 'MARK_REMOVED',
        resourceType: 'TICKET_MARK',
        resourceId: `${ticketId}:${cellId}`,
        metadata: {
          ticketId,
          cellId,
          roundId: round.id,
          actorEmail: profile.email,
          resourceName: 'Ticket cell mark removed',
        },
      });
    }

    return { success: true };
  }
}

export const markService = new MarkService();
