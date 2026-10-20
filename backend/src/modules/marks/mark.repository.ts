import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { ticketMarks, type TicketMarkRecord } from '../../db/schema/marks.ts';
import { tickets, ticketCells, type TicketRecord, type TicketCellRecord } from '../../db/schema/tickets.ts';

export interface IMarkRepository {
  findMark(ticketId: string, cellId: string, tx?: any): Promise<TicketMarkRecord | null>;
  createMark(ticketId: string, cellId: string, tx?: any): Promise<{ mark: TicketMarkRecord; created: boolean }>;
  deleteMark(ticketId: string, cellId: string, tx?: any): Promise<boolean>;
  getMarksForTicket(ticketId: string, tx?: any): Promise<TicketMarkRecord[]>;
  getCell(cellId: string, tx?: any): Promise<TicketCellRecord | null>;
  getTicket(ticketId: string, tx?: any): Promise<TicketRecord | null>;
}

export class MarkRepository implements IMarkRepository {
  private getDbInstance(tx?: any) {
    return tx || getDb();
  }

  async findMark(ticketId: string, cellId: string, tx?: any): Promise<TicketMarkRecord | null> {
    const db = this.getDbInstance(tx);
    const [row] = await db
      .select()
      .from(ticketMarks)
      .where(and(eq(ticketMarks.ticketId, ticketId), eq(ticketMarks.cellId, cellId)))
      .limit(1);

    return row || null;
  }

  async createMark(
    ticketId: string,
    cellId: string,
    tx?: any
  ): Promise<{ mark: TicketMarkRecord; created: boolean }> {
    const db = this.getDbInstance(tx);

    // Check if already exists
    const [existing] = await db
      .select()
      .from(ticketMarks)
      .where(and(eq(ticketMarks.ticketId, ticketId), eq(ticketMarks.cellId, cellId)))
      .limit(1);

    if (existing) {
      return { mark: existing, created: false };
    }

    const [inserted] = await db
      .insert(ticketMarks)
      .values({ ticketId, cellId })
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      // Race condition lost; retrieve the existing record
      const [reloaded] = await db
        .select()
        .from(ticketMarks)
        .where(and(eq(ticketMarks.ticketId, ticketId), eq(ticketMarks.cellId, cellId)))
        .limit(1);
      return { mark: reloaded!, created: false };
    }

    return { mark: inserted, created: true };
  }

  async deleteMark(ticketId: string, cellId: string, tx?: any): Promise<boolean> {
    const db = this.getDbInstance(tx);
    const deleted = await db
      .delete(ticketMarks)
      .where(and(eq(ticketMarks.ticketId, ticketId), eq(ticketMarks.cellId, cellId)))
      .returning();

    return deleted.length > 0;
  }

  async getMarksForTicket(ticketId: string, tx?: any): Promise<TicketMarkRecord[]> {
    const db = this.getDbInstance(tx);
    return db
      .select()
      .from(ticketMarks)
      .where(eq(ticketMarks.ticketId, ticketId));
  }

  async getCell(cellId: string, tx?: any): Promise<TicketCellRecord | null> {
    const db = this.getDbInstance(tx);
    const [cell] = await db
      .select()
      .from(ticketCells)
      .where(eq(ticketCells.id, cellId))
      .limit(1);

    return cell || null;
  }

  async getTicket(ticketId: string, tx?: any): Promise<TicketRecord | null> {
    const db = this.getDbInstance(tx);
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    return ticket || null;
  }
}

export const markRepository = new MarkRepository();
