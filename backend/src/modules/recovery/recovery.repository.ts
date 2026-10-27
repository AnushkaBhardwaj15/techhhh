import { alias } from 'drizzle-orm/pg-core';
import { count, eq, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { claims, winners } from '../../db/schema/claims.ts';
import { draws } from '../../db/schema/draws.ts';
import { rounds, roundPatterns } from '../../db/schema/rounds.ts';
import { ticketMarks } from '../../db/schema/marks.ts';
import { ticketCells, tickets } from '../../db/schema/tickets.ts';
import type { RecoverySnapshot } from './recovery.domain.ts';

export interface IRecoveryRepository {
  listActiveRoundIds(tx: unknown): Promise<string[]>;
  findRound(roundId: string, tx: unknown): Promise<{ id: string; eventId: string; status: string } | null>;
  updateRoundStatus(roundId: string, status: 'RECOVERY_REQUIRED' | 'ACTIVE', tx: unknown): Promise<void>;
  clearUndrawnMarks?(roundId: string, tx: unknown): Promise<number>;
  getSnapshot(roundId: string, eventId: string, tx: unknown): Promise<RecoverySnapshot>;
}

export class RecoveryRepository implements IRecoveryRepository {
  private client(tx: unknown): any { return tx; }

  async listActiveRoundIds(tx: unknown): Promise<string[]> {
    const rows = await this.client(tx).select({ id: rounds.id }).from(rounds).where(eq(rounds.status, 'ACTIVE'));
    return rows.map((row: { id: string }) => row.id);
  }

  async findRound(roundId: string, tx: unknown): Promise<{ id: string; eventId: string; status: string } | null> {
    const [row] = await this.client(tx).select({ id: rounds.id, eventId: rounds.eventId, status: rounds.status }).from(rounds).where(eq(rounds.id, roundId)).limit(1);
    return row ?? null;
  }

  async updateRoundStatus(roundId: string, status: 'RECOVERY_REQUIRED' | 'ACTIVE', tx: unknown): Promise<void> {
    await this.client(tx).update(rounds).set({ status, updatedAt: new Date() }).where(eq(rounds.id, roundId));
  }

  async clearUndrawnMarks(roundId: string, tx: unknown): Promise<number> {
    const removed = await this.client(tx).execute(sql`
      DELETE FROM ticket_marks m USING tickets t, ticket_cells c
      WHERE m.ticket_id=t.id AND m.cell_id=c.id AND c.ticket_id=t.id
        AND t.round_id=${roundId}
        AND NOT EXISTS (SELECT 1 FROM draws d WHERE d.round_id=t.round_id AND d.key_id=c.key_id)
      RETURNING m.id`);
    return removed.length;
  }

  async getSnapshot(roundId: string, eventId: string, tx: unknown) {
    const client = this.client(tx);
    const markedTickets = alias(tickets, 'recovery_marked_ticket');
    const markedCells = alias(ticketCells, 'recovery_marked_cell');
    const cellTickets = alias(tickets, 'recovery_cell_ticket');
    const [drawRows, ticketRows, cellRows, markRows, drawnRows, patternRows, winnerRows, activeCountRows, claimRows] = await Promise.all([
      client.select({ sequenceNumber: draws.sequenceNumber }).from(draws).where(eq(draws.roundId, roundId)).orderBy(draws.sequenceNumber),
      client.select({ id: tickets.id, eventId: tickets.eventId }).from(tickets).where(eq(tickets.roundId, roundId)),
      client.select({ ticketId: ticketCells.ticketId, keyId: ticketCells.keyId, rowIndex: ticketCells.rowIndex, colIndex: ticketCells.colIndex }).from(ticketCells).innerJoin(tickets, eq(ticketCells.ticketId, tickets.id)).where(eq(tickets.roundId, roundId)),
      client.select({ ticketId: ticketMarks.ticketId, cellTicketId: markedCells.ticketId, keyId: markedCells.keyId }).from(ticketMarks).innerJoin(markedTickets, eq(ticketMarks.ticketId, markedTickets.id)).innerJoin(markedCells, eq(ticketMarks.cellId, markedCells.id)).innerJoin(cellTickets, eq(markedCells.ticketId, cellTickets.id)).where(or(eq(markedTickets.roundId, roundId), eq(cellTickets.roundId, roundId))),
      client.select({ keyId: draws.keyId }).from(draws).where(eq(draws.roundId, roundId)),
      client.select({ patternType: roundPatterns.patternType, maxWinners: roundPatterns.maxWinners, patternStatus: roundPatterns.status }).from(roundPatterns).where(eq(roundPatterns.roundId, roundId)),
      client.select({ patternType: winners.patternType, eventId: winners.eventId, roundId: winners.roundId, participantId: winners.participantId, claimId: winners.claimId, claimRoundId: claims.roundId, claimParticipantId: claims.participantId, claimPatternType: claims.patternType }).from(winners).leftJoin(claims, eq(winners.claimId, claims.id)).where(eq(winners.roundId, roundId)),
      client.select({ count: count() }).from(rounds).where(eq(rounds.status, 'ACTIVE')),
      client.select({ claimId: claims.id, claimStatus: claims.status, claimRoundId: claims.roundId, claimParticipantId: claims.participantId, claimTicketId: claims.ticketId, ticketId: tickets.id, ticketRoundId: tickets.roundId, ticketParticipantId: tickets.participantId, claimPatternType: claims.patternType, winnerClaimId: winners.claimId, winnerRoundId: winners.roundId, winnerEventId: winners.eventId, winnerParticipantId: winners.participantId, winnerPatternType: winners.patternType }).from(claims).leftJoin(winners, eq(winners.claimId, claims.id)).leftJoin(tickets, eq(tickets.id, claims.ticketId)).where(eq(claims.roundId, roundId)),
    ]);
    const cellsByTicket = new Map<string, Array<{ keyId: string; rowIndex: number; colIndex: number }>>();
    for (const cell of cellRows as Array<{ ticketId: string; keyId: string; rowIndex: number; colIndex: number }>) cellsByTicket.set(cell.ticketId, [...(cellsByTicket.get(cell.ticketId) ?? []), { keyId: cell.keyId, rowIndex: cell.rowIndex, colIndex: cell.colIndex }]);
    return {
      drawSequences: (drawRows as Array<{ sequenceNumber: number }>).map((draw) => draw.sequenceNumber),
      tickets: (ticketRows as Array<{ id: string }>).map((ticket) => ({ id: ticket.id, cells: cellsByTicket.get(ticket.id) ?? [] })),
      marks: (markRows as Array<{ ticketId: string; cellTicketId: string; keyId: string }>).map((mark) => ({ ticketId: mark.ticketId, cellTicketId: mark.cellTicketId, keyId: mark.keyId })),
      drawnKeyIds: (drawnRows as Array<{ keyId: string }>).map((draw) => draw.keyId),
      configuredPatterns: (patternRows as Array<{ patternType: string; maxWinners: number; patternStatus: string }>).map((pattern) => ({ patternType: pattern.patternType, maxWinners: pattern.maxWinners, patternStatus: pattern.patternStatus as 'OPEN' | 'CLOSED' })),
      winnerPatternTypes: (winnerRows as Array<{ patternType: string }>).map((winner) => winner.patternType),
      activeRoundCount: Number((activeCountRows as Array<{ count: number }>)[0]?.count ?? 0),
      eventId,
      ticketEventIds: (ticketRows as Array<{ eventId: string }>).map((ticket) => ticket.eventId),
      claimRelations: claimRows,
      winnerRelations: winnerRows,
    };
  }
}

export const recoveryRepository = new RecoveryRepository();
