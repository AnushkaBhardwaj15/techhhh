import { and, asc, count, desc, eq, gt, isNull, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { tickets, ticketCells, type TicketCellRecord, type TicketRecord } from '../../db/schema/tickets.ts';
import { roundQuestions, eventKeys } from '../../db/schema/questions.ts';
import { ticketMarks } from '../../db/schema/marks.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { adminProfiles, participantProfiles, sessions, users } from '../../db/schema/users.ts';
import type { GeneratedCell, TicketKey } from './ticket.domain.ts';
import type { ITicketRepository } from './ticket.types.ts';

type TicketCellJoinRow = { cell: TicketCellRecord | null; keyValue: string | null; markedAt: Date | null };

function mapTicketCells(rows: TicketCellJoinRow[]) {
  return rows.flatMap((row) => row.cell && row.keyValue !== null
    ? [{ ...row.cell, keyValue: row.keyValue, marked: row.markedAt !== null }]
    : []);
}

export class TicketRepository implements ITicketRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  async getRoundKeys(roundId: string, tx?: any): Promise<TicketKey[]> {
    const db = this.getClient(tx);
    const rows = await db
      .select({
        id: eventKeys.id,
        value: eventKeys.value,
      })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .where(eq(roundQuestions.roundId, roundId));

    // Deduplicate by key id just in case
    const map = new Map<string, TicketKey>();
    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, { id: r.id, value: r.value });
      }
    }
    return Array.from(map.values());
  }

  async findExistingTicketParticipantIds(roundId: string, tx?: any): Promise<Set<string>> {
    const db = this.getClient(tx);
    const rows = await db
      .select({ participantId: tickets.participantId })
      .from(tickets)
      .where(eq(tickets.roundId, roundId));

    return new Set(rows.map((r: { participantId: string }) => r.participantId));
  }

  async createTicketWithCells(
    data: {
      roundId: string;
      participantId: string;
      eventId: string;
      cells: GeneratedCell[];
    },
    tx?: any
  ): Promise<TicketRecord> {
    const db = this.getClient(tx);

    const [ticket] = await db
      .insert(tickets)
      .values({
        roundId: data.roundId,
        participantId: data.participantId,
        eventId: data.eventId,
      })
      .returning();

    if (!ticket) {
      throw new Error('Failed to insert ticket');
    }

    const cellInserts = data.cells.map((cell) => ({
      ticketId: ticket.id,
      keyId: cell.keyId,
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
    }));

    await db.insert(ticketCells).values(cellInserts);
    return ticket;
  }

  async findByParticipantAndRound(
    participantId: string,
    roundId: string,
    tx?: any
  ): Promise<(TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string; marked: boolean }> }) | null> {
    const db = this.getClient(tx);

    const rows = await db
      .select({
        ticket: tickets,
        cell: ticketCells,
        keyValue: eventKeys.value,
        markedAt: ticketMarks.markedAt,
      })
      .from(tickets)
      .leftJoin(ticketCells, eq(ticketCells.ticketId, tickets.id))
      .leftJoin(eventKeys, eq(ticketCells.keyId, eventKeys.id))
      .leftJoin(ticketMarks, and(eq(ticketMarks.ticketId, tickets.id), eq(ticketMarks.cellId, ticketCells.id)))
      .where(and(eq(tickets.participantId, participantId), eq(tickets.roundId, roundId)))
      .orderBy(asc(ticketCells.rowIndex), asc(ticketCells.colIndex));

    if (!rows.length) return null;

    return {
      ...rows[0]!.ticket,
      cells: mapTicketCells(rows),
    };
  }

  async findByUserAndRound(
    userId: string,
    roundId: string
  ) {
    const db = this.getClient();
    const rows = await db
      .select({
        profile: participantProfiles,
        ticket: tickets,
        cell: ticketCells,
        keyValue: eventKeys.value,
        markedAt: ticketMarks.markedAt,
      })
      .from(participantProfiles)
      .innerJoin(rounds, and(eq(rounds.id, roundId), eq(rounds.eventId, participantProfiles.eventId)))
      .leftJoin(tickets, and(eq(tickets.participantId, participantProfiles.id), eq(tickets.roundId, rounds.id), eq(tickets.eventId, rounds.eventId)))
      .leftJoin(ticketCells, eq(ticketCells.ticketId, tickets.id))
      .leftJoin(eventKeys, eq(ticketCells.keyId, eventKeys.id))
      .leftJoin(ticketMarks, and(eq(ticketMarks.ticketId, tickets.id), eq(ticketMarks.cellId, ticketCells.id)))
      .where(and(eq(participantProfiles.userId, userId), eq(participantProfiles.status, 'ACTIVE')))
      .orderBy(asc(ticketCells.rowIndex), asc(ticketCells.colIndex));

    if (!rows.length || !rows[0]!.ticket) return null;
    return {
      ...rows[0]!.ticket,
      cells: mapTicketCells(rows),
    };
  }

  private readonly sessionTicketQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<TicketRepository['prepareSessionTicket']>>();

  private prepareSessionTicket(db: ReturnType<typeof getDb>) {
    return db
      .select({
        userStatus: users.status,
        adminRole: adminProfiles.role,
        profileId: participantProfiles.id,
        profileEventId: participantProfiles.eventId,
        profileStatus: participantProfiles.status,
        roundId: rounds.id,
        ticket: tickets,
        cells: sql<Array<TicketCellRecord & { keyValue: string; marked: boolean }>>`(
          SELECT COALESCE(json_agg(json_build_object(
            'id', ${ticketCells.id},
            'ticketId', ${ticketCells.ticketId},
            'keyId', ${ticketCells.keyId},
            'rowIndex', ${ticketCells.rowIndex},
            'colIndex', ${ticketCells.colIndex},
            'createdAt', ${ticketCells.createdAt},
            'keyValue', ${eventKeys.value},
            'marked', ${ticketMarks.markedAt} IS NOT NULL
          ) ORDER BY ${ticketCells.rowIndex}, ${ticketCells.colIndex}), '[]'::json)
          FROM ${ticketCells}
          INNER JOIN ${eventKeys} ON ${eventKeys.id} = ${ticketCells.keyId}
          LEFT JOIN ${ticketMarks} ON ${ticketMarks.ticketId} = ${ticketCells.ticketId} AND ${ticketMarks.cellId} = ${ticketCells.id}
          WHERE ${ticketCells.ticketId} = ${tickets.id}
        )`,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, and(eq(participantProfiles.userId, users.id), eq(participantProfiles.eventId, placeholder('eventId'))))
      .leftJoin(rounds, and(eq(rounds.id, placeholder('roundId')), eq(rounds.eventId, participantProfiles.eventId)))
      .leftJoin(tickets, and(eq(tickets.participantId, participantProfiles.id), eq(tickets.roundId, rounds.id), eq(tickets.eventId, rounds.eventId)))
      .where(and(eq(sessions.id, placeholder('sessionId')), eq(sessions.userId, placeholder('userId')), isNull(sessions.revokedAt), gt(sessions.expiresAt, placeholder('now')))).prepare('participant_ticket_read');
  }

  async findBySessionAndRound(sessionId: string, userId: string, roundId: string, eventId: string) {
    const db = getDb();
    let query = this.sessionTicketQueries.get(db);
    if (!query) {
      query = this.prepareSessionTicket(db);
      this.sessionTicketQueries.set(db, query);
    }
    const rows = await query.execute({ sessionId, userId, roundId, eventId, now: new Date().toISOString() });

    if (!rows.length) return null;
    const first = rows[0]!;
    return {
      userStatus: first.userStatus,
      adminRole: first.adminRole,
      profile: first.profileId ? { id: first.profileId, eventId: first.profileEventId!, status: first.profileStatus! } : null,
      roundFound: first.roundId !== null,
      ticket: first.ticket ? {
        ...first.ticket,
        cells: first.cells.map((cell: TicketCellRecord & { keyValue: string; marked: boolean }) => ({ ...cell, createdAt: new Date(cell.createdAt) })),
      } : null,
    };
  }

  async findTicketById(
    ticketId: string,
    tx?: any
  ): Promise<(TicketRecord & { cells: Array<TicketCellRecord & { keyValue: string }> }) | null> {
    const db = this.getClient(tx);

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      return null;
    }

    const cells = await db
      .select({
        id: ticketCells.id,
        ticketId: ticketCells.ticketId,
        keyId: ticketCells.keyId,
        rowIndex: ticketCells.rowIndex,
        colIndex: ticketCells.colIndex,
        createdAt: ticketCells.createdAt,
        keyValue: eventKeys.value,
      })
      .from(ticketCells)
      .innerJoin(eventKeys, eq(ticketCells.keyId, eventKeys.id))
      .where(eq(ticketCells.ticketId, ticket.id));

    cells.sort((a: { rowIndex: number; colIndex: number }, b: { rowIndex: number; colIndex: number }) => {
      if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
      return a.colIndex - b.colIndex;
    });

    return {
      ...ticket,
      cells,
    };
  }

  async listTicketsForRound(
    roundId: string,
    options: { page: number; limit: number },
    tx?: any
  ): Promise<{ data: TicketRecord[]; total: number }> {
    const db = this.getClient(tx);
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    const [totalResult] = await db
      .select({ count: count() })
      .from(tickets)
      .where(eq(tickets.roundId, roundId));

    const total = Number(totalResult?.count ?? 0);

    const data = await db
      .select()
      .from(tickets)
      .where(eq(tickets.roundId, roundId))
      .orderBy(desc(tickets.createdAt))
      .limit(limit)
      .offset(offset);

    return { data, total };
  }
}

export const ticketRepository = new TicketRepository();
