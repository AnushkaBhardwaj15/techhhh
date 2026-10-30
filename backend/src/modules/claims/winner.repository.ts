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
  roundId?: string;
  page: number;
  limit: number;
}

export interface IWinnerRepository {
  paymentDeclared(ticketId: string, tx: any): Promise<boolean>;
  revokeClaim(claimId: string, roundId: string, patternType: string, tx: any): Promise<WinnerRecord[]>;
  create(data: InsertWinner, tx: any): Promise<WinnerRecord>;
  countByRoundPattern(roundId: string, patternType: string, tx: any): Promise<number>;
  findParticipantIdByUserId(userId: string, eventId: string): Promise<string | null>;
  listAll(options: WinnerListOptions): Promise<{ data: WinnerListRow[]; total: number }>;
  listByParticipant(participantId: string, options: WinnerListOptions): Promise<{ data: WinnerListRow[]; total: number }>;
}

export class WinnerRepository implements IWinnerRepository {
  async paymentDeclared(ticketId: string, tx: any): Promise<boolean> {
    const rows = await tx.execute(sql`SELECT payment_declared FROM tickets WHERE id=${ticketId}`);
    return rows[0]?.payment_declared === true;
  }

  async revokeClaim(claimId: string, roundId: string, patternType: string, tx: any): Promise<WinnerRecord[]> {
    const removed = await tx.select().from(winners).where(eq(winners.claimId, claimId));
    await tx.execute(sql`UPDATE round_patterns SET status='OPEN' WHERE round_id=${roundId} AND pattern_type=${patternType} AND (SELECT count(*) FROM winners WHERE round_id=${roundId} AND pattern_type=${patternType} AND claim_id<>${claimId} AND EXISTS (SELECT 1 FROM claims c WHERE c.id=winners.claim_id AND c.status='VERIFIED')) < max_winners`);
    if (patternType === 'FULL_HOUSE') {
      await tx.execute(sql`UPDATE rounds SET closing_sequence=NULL WHERE id=${roundId} AND NOT EXISTS (SELECT 1 FROM winners WHERE round_id=${roundId} AND pattern_type='FULL_HOUSE' AND claim_id<>${claimId} AND EXISTS (SELECT 1 FROM claims c WHERE c.id=winners.claim_id AND c.status='VERIFIED'))`);
    }
    return removed;
  }

  async findParticipantIdByUserId(userId: string, eventId: string): Promise<string | null> {
    const [profile] = await getDb().select({ id: participantProfiles.id }).from(participantProfiles).where(and(eq(participantProfiles.userId, userId), eq(participantProfiles.eventId, eventId))).limit(1);
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
      .where(and(eq(winners.roundId, roundId), eq(winners.patternType, patternType), sql`EXISTS (SELECT 1 FROM claims active_claim WHERE active_claim.id = ${winners.claimId} AND active_claim.status='VERIFIED')`));
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
      const where = and(sql`EXISTS (SELECT 1 FROM claims active_claim WHERE active_claim.id = ${winners.claimId} AND active_claim.status='VERIFIED')`, participantId ? eq(winners.participantId, participantId) : undefined, options.roundId ? eq(winners.roundId, options.roundId) : undefined);
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
