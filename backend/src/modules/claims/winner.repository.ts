import type { ReferenceWinContext, ReferenceWinTransition } from './winner.domain.ts';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { events } from '../../db/schema/events.ts';
import { claims, winners, type InsertWinner, type WinnerRecord } from '../../db/schema/claims.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { participantProfiles, users } from '../../db/schema/users.ts';

export interface WinnerListRow extends WinnerRecord {
  participantName: string;
  eventTitle: string;
  ticketId: string;
}

export interface WinnerListOptions {
  page: number;
  limit: number;
}

export interface IWinnerRepository {
  lockReferenceRound(roundId: string, tx: any): Promise<ReferenceWinContext | null>;
  updateReferenceRound(roundId: string, transition: ReferenceWinTransition, tx: any): Promise<void>;
  create(data: InsertWinner, tx: any): Promise<WinnerRecord>;
  countByRoundPattern(roundId: string, patternType: string, tx: any): Promise<number>;
  findParticipantIdByUserId(userId: string, eventId: string): Promise<string | null>;
  listAll(options: WinnerListOptions): Promise<{ data: WinnerListRow[]; total: number }>;
  listByParticipant(participantId: string, options: WinnerListOptions): Promise<{ data: WinnerListRow[]; total: number }>;
}

export class WinnerRepository implements IWinnerRepository {
  async lockReferenceRound(roundId: string, tx: any): Promise<ReferenceWinContext | null> {
    const result = await tx.execute(sql`SELECT r.status,r.closing_sequence AS "closingSequence",
      (SELECT count(*)::int FROM draws d WHERE d.round_id=r.id) AS "drawCount",
      (SELECT w.participant_id FROM winners w WHERE w.round_id=r.id AND w.pattern_type='FULL_HOUSE' ORDER BY w.verified_at,w.id LIMIT 1) AS "firstHouseParticipantId"
      FROM rounds r WHERE r.id=${roundId} AND r.game_code IS NOT NULL FOR UPDATE`);
    return (result.rows ?? result)[0] ?? null;
  }

  async updateReferenceRound(roundId: string, transition: ReferenceWinTransition, tx: any): Promise<void> {
    if (transition.closingSequence !== undefined) {
      await tx.execute(sql`UPDATE rounds SET closing_sequence=${transition.closingSequence},updated_at=now() WHERE id=${roundId} AND game_code IS NOT NULL AND status IN ('ACTIVE','PAUSED') AND closing_sequence IS NULL`);
    }
    if (transition.status === 'COMPLETED') {
      await tx.execute(sql`UPDATE rounds SET status='COMPLETED',updated_at=now() WHERE id=${roundId} AND game_code IS NOT NULL AND status IN ('ACTIVE','PAUSED')`);
    }
  }

  async findParticipantIdByUserId(userId: string, eventId: string): Promise<string | null> {
    const db = getDb();
    const [profile] = await db
      .select({ id: participantProfiles.id })
      .from(participantProfiles)
      .where(and(eq(participantProfiles.userId, userId), eq(participantProfiles.eventId, eventId)))
      .limit(1);
    return profile?.id ?? null;
  }

  async create(data: InsertWinner, tx: any): Promise<WinnerRecord> {
    const [existing] = await tx.select().from(winners).where(eq(winners.claimId, data.claimId)).limit(1);
    if (existing) return existing;

    const [winner] = await tx.insert(winners).values(data).returning();
    if (!winner) throw new Error('Winner insert returned no record');
    return winner;
  }

  async countByRoundPattern(roundId: string, patternType: string, tx: any): Promise<number> {
    const [filtered] = await tx
      .select({ count: count() })
      .from(winners)
      .where(and(eq(winners.roundId, roundId), eq(winners.patternType, patternType)));
    return Number(filtered?.count ?? 0);
  }

  async listAll(
    options: WinnerListOptions
  ): Promise<{ data: WinnerListRow[]; total: number }> {
    return this.list(undefined, options);
  }

  async listByParticipant(
    participantId: string,
    options: WinnerListOptions
  ): Promise<{ data: WinnerListRow[]; total: number }> {
    return this.list(participantId, options);
  }

  private async list(
    participantId: string | undefined,
    options: WinnerListOptions
  ): Promise<{ data: WinnerListRow[]; total: number }> {
    const db = getDb();
      const { page, limit } = options;
      const offset = (page - 1) * limit;
      const where = participantId
        ? eq(winners.participantId, participantId)
        : undefined;
      const [totalRow] = await db
        .select({ count: count() })
        .from(winners)
        .leftJoin(participantProfiles, eq(winners.participantId, participantProfiles.id))
        .where(where);
      const data = await db
        .select({
          id: winners.id,
          claimId: winners.claimId,
          participantId: winners.participantId,
          roundId: winners.roundId,
          eventId: winners.eventId,
          patternType: winners.patternType,
          verifiedBy: winners.verifiedBy,
          verifiedAt: winners.verifiedAt,
          ticketId: sql<string>`COALESCE(${claims.ticketId}, ${winners.id})`,
          participantName: sql<string>`COALESCE(${users.name}, 'Player')`,
          eventTitle: sql<string>`COALESCE(${events.title}, 'Tech Tambola')`,
        })
        .from(winners)
        .leftJoin(claims, eq(winners.claimId, claims.id))
        .leftJoin(participantProfiles, eq(winners.participantId, participantProfiles.id))
        .leftJoin(users, eq(participantProfiles.userId, users.id))
        .leftJoin(events, eq(winners.eventId, events.id))
        .where(where)
        .orderBy(desc(winners.verifiedAt), desc(winners.id))
        .limit(limit)
        .offset(offset);
    return { data: data as WinnerListRow[], total: Number(totalRow?.count ?? 0) };
  }
}
