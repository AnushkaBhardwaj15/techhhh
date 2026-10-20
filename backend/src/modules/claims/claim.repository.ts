import { and, count, desc, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { claims, type ClaimRecord, type InsertClaim } from '../../db/schema/claims.ts';
import { roundPatterns, rounds, type RoundPatternRecord } from '../../db/schema/rounds.ts';
import { events } from '../../db/schema/events.ts';
import { participantProfiles, users } from '../../db/schema/users.ts';

export interface AdminClaimListRow extends ClaimRecord {
  participantName: string;
  eventId: string;
  eventTitle: string;
}

export interface IClaimRepository {
  create(data: InsertClaim, tx?: any): Promise<ClaimRecord>;
  findExistingClaim(
    roundId: string,
    participantId: string,
    patternType: string,
    tx?: any
  ): Promise<ClaimRecord | null>;
  listByParticipant(
    participantId: string,
    options: { page: number; limit: number },
    tx?: any
  ): Promise<{ data: ClaimRecord[]; total: number }>;
  getRoundPattern(
    roundId: string,
    patternType: string,
    tx?: any
  ): Promise<RoundPatternRecord | null>;
  lockById(claimId: string, tx: any): Promise<ClaimRecord | null>;
  lockRoundPattern(roundId: string, patternType: string, tx: any): Promise<RoundPatternRecord | null>;
  updateStatus(claimId: string, data: { status: string; rejectionReason?: string | null; verifiedBy?: string; verifiedAt?: Date }, tx: any): Promise<ClaimRecord>;
  closePattern(roundId: string, patternType: string, tx: any): Promise<void>;
  getEventAndParticipantName(claimId: string, tx: any): Promise<{ eventId: string; participantName: string } | null>;
  listAll(options: { page: number; limit: number }): Promise<{ data: AdminClaimListRow[]; total: number }>;
}

export class ClaimRepository implements IClaimRepository {
  private getDbInstance(tx?: any) {
    return tx || getDb();
  }

  async create(data: InsertClaim, tx?: any): Promise<ClaimRecord> {
    const db = this.getDbInstance(tx);
    const [created] = await db.insert(claims).values(data).returning();
    return created;
  }

  async findExistingClaim(
    roundId: string,
    participantId: string,
    patternType: string,
    tx?: any
  ): Promise<ClaimRecord | null> {
    const db = this.getDbInstance(tx);
    const [existing] = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.roundId, roundId),
          eq(claims.participantId, participantId),
          eq(claims.patternType, patternType)
        )
      )
      .limit(1);

    return existing || null;
  }

  async listByParticipant(
    participantId: string,
    options: { page: number; limit: number },
    tx?: any
  ): Promise<{ data: ClaimRecord[]; total: number }> {
    const db = this.getDbInstance(tx);
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    const [totalRes] = await db
      .select({ count: count() })
      .from(claims)
      .where(eq(claims.participantId, participantId));

    const total = totalRes?.count ? Number(totalRes.count) : 0;

    const data = await db
      .select()
      .from(claims)
      .where(eq(claims.participantId, participantId))
      .orderBy(desc(claims.createdAt), desc(claims.id))
      .limit(limit)
      .offset(offset);

    return { data, total };
  }

  async getRoundPattern(
    roundId: string,
    patternType: string,
    tx?: any
  ): Promise<RoundPatternRecord | null> {
    const db = this.getDbInstance(tx);
    const [pattern] = await db
      .select()
      .from(roundPatterns)
      .where(
        and(
          eq(roundPatterns.roundId, roundId),
          eq(roundPatterns.patternType, patternType)
        )
      )
      .limit(1);

    return pattern || null;
  }

  async lockById(claimId: string, tx: any): Promise<ClaimRecord | null> {
    const rows = await tx.select().from(claims).where(eq(claims.id, claimId)).for('update');
    return rows[0] || null;
  }

  async lockRoundPattern(roundId: string, patternType: string, tx: any): Promise<RoundPatternRecord | null> {
    const rows = await tx
      .select()
      .from(roundPatterns)
      .where(and(eq(roundPatterns.roundId, roundId), eq(roundPatterns.patternType, patternType)))
      .for('update');
    return rows[0] || null;
  }

  async updateStatus(
    claimId: string,
    data: { status: string; rejectionReason?: string | null; verifiedBy?: string; verifiedAt?: Date },
    tx: any
  ): Promise<ClaimRecord> {
    const [updated] = await tx
      .update(claims)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(claims.id, claimId))
      .returning();
    return updated;
  }

  async closePattern(roundId: string, patternType: string, tx: any): Promise<void> {
    await tx
      .update(roundPatterns)
      .set({ status: 'CLOSED', updatedAt: new Date() })
      .where(and(eq(roundPatterns.roundId, roundId), eq(roundPatterns.patternType, patternType)));
  }

  async getEventAndParticipantName(
    claimId: string,
    tx: any
  ): Promise<{ eventId: string; participantName: string } | null> {
    const [row] = await tx
      .select({ eventId: rounds.eventId, participantName: users.name })
      .from(claims)
      .innerJoin(rounds, eq(claims.roundId, rounds.id))
      .innerJoin(participantProfiles, eq(claims.participantId, participantProfiles.id))
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(eq(claims.id, claimId))
      .limit(1);
    return row || null;
  }

  async listAll(
    options: { page: number; limit: number }
  ): Promise<{ data: AdminClaimListRow[]; total: number }> {
    const db = getDb();
    const { page, limit } = options;
    const offset = (page - 1) * limit;
    const [totalRow] = await db.select({ count: count() }).from(claims);
    const data = await db
      .select({
        id: claims.id,
        roundId: claims.roundId,
        participantId: claims.participantId,
        ticketId: claims.ticketId,
        patternType: claims.patternType,
        status: claims.status,
        rejectionReason: claims.rejectionReason,
        verifiedBy: claims.verifiedBy,
        verifiedAt: claims.verifiedAt,
        createdAt: claims.createdAt,
        updatedAt: claims.updatedAt,
        participantName: users.name,
        eventId: events.id,
        eventTitle: events.title,
      })
      .from(claims)
      .innerJoin(rounds, eq(claims.roundId, rounds.id))
      .innerJoin(events, eq(rounds.eventId, events.id))
      .innerJoin(participantProfiles, eq(claims.participantId, participantProfiles.id))
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .orderBy(desc(claims.createdAt), desc(claims.id))
      .limit(limit)
      .offset(offset);
    return { data, total: Number(totalRow?.count ?? 0) };
  }
}

export const claimRepository = new ClaimRepository();
