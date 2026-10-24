import { and, count, desc, eq, gt, inArray, isNull, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import {
  rounds,
  roundPatterns,
  type RoundRecord,
  type RoundPatternRecord,
  type InsertRound,
} from '../../db/schema/rounds.ts';
import { roundQuestions } from '../../db/schema/questions.ts';
import { adminProfiles, participantProfiles, sessions, users } from '../../db/schema/users.ts';
import { tickets } from '../../db/schema/tickets.ts';
import type {
  PatternConfig,
  PatternSummary,
  RoundStatus,
  RoundSummary,
} from './round.types.ts';
import { getSharedActiveGame } from './activeGameStore.ts';

export interface IRoundRepository {
  create(roundData: InsertRound, patterns: PatternConfig[], tx?: any): Promise<RoundSummary>;
  findById(id: string, tx?: any): Promise<RoundSummary | null>;
  findByEventAndSequence(eventId: string, sequenceNumber: number, tx?: any): Promise<RoundSummary | null>;
  findActiveRound(tx?: any): Promise<RoundSummary | null>;
  findCurrentRoundForEvent(eventId: string, tx?: any): Promise<RoundSummary | null>;
  findCurrentRoundForParticipant(userId: string, eventId: string, tx?: any): Promise<RoundSummary | null>;
  findCurrentRoundForSession(sessionId: string, userId: string, eventId: string, tx?: any): Promise<{
    userStatus: string;
    adminRole: string | null;
    profileStatus: string | null;
    round: RoundSummary | null;
  } | null>;
  getReadinessMetrics(roundId: string, eventId: string, tx?: any): Promise<{ questionCount: number; activeParticipantsCount: number; ticketsCount: number }>;
  acquireGlobalActiveLock(tx: any): Promise<void>;
  list(options: { page?: number; limit: number; eventId?: string; status?: RoundStatus }, tx?: any): Promise<{ data: RoundSummary[]; total: number }>;
  update(id: string, roundData: Partial<InsertRound>, patterns?: PatternConfig[], tx?: any): Promise<RoundSummary>;
}

export class RoundRepository implements IRoundRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  private mapPattern(r: RoundPatternRecord): PatternSummary {
    return {
      id: r.id,
      roundId: r.roundId,
      patternType: r.patternType as any,
      enabled: r.enabled,
      maxWinners: r.maxWinners,
      status: r.status as any,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapRound(r: RoundRecord, patterns: RoundPatternRecord[] = []): RoundSummary {
    return {
      id: r.id,
      eventId: r.eventId,
      sequenceNumber: r.sequenceNumber,
      name: r.name,
      status: r.status as RoundStatus,
      patterns: patterns.map((p) => this.mapPattern(p)),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async create(roundData: InsertRound, patterns: PatternConfig[], tx?: any): Promise<RoundSummary> {
    const client = this.getClient(tx);

    const [roundRecord] = await client.insert(rounds).values(roundData).returning();

    let patternRecords: RoundPatternRecord[] = [];
    if (patterns.length > 0) {
      patternRecords = await client
        .insert(roundPatterns)
        .values(
          patterns.map((p) => ({
            roundId: roundRecord.id,
            patternType: p.patternType,
            enabled: p.enabled,
            maxWinners: p.maxWinners,
            status: 'OPEN',
          }))
        )
        .returning();
    }

    return this.mapRound(roundRecord, patternRecords);
  }

  private readonly byIdQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<RoundRepository['prepareById']>>();

  private prepareById(client: ReturnType<typeof getDb>) {
    return client
      .select({ round: rounds, pattern: roundPatterns })
      .from(rounds)
      .leftJoin(roundPatterns, eq(roundPatterns.roundId, rounds.id))
      .where(eq(rounds.id, placeholder('id'))).prepare('rounds_by_id');
  }

  async findById(id: string, tx?: any): Promise<RoundSummary | null> {
    try {
      const client = this.getClient(tx);
      let query = this.byIdQueries.get(client);
      if (!query) {
        query = this.prepareById(client);
        this.byIdQueries.set(client, query);
      }
      const rows = await query.execute({ id });
      if (rows.length) {
        return this.mapRound(rows[0]!.round, rows.flatMap((row: { pattern: RoundPatternRecord | null }) => row.pattern ? [row.pattern] : []));
      }
    } catch {
      // Database not reachable
    }

    const active = getSharedActiveGame();
    if (id === active.id || !id) {
      const patternTypes = ['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'] as const;
      return {
        id: active.id,
        eventId: 'e7bf4217-f212-4970-b3f1-e924e1782f25',
        sequenceNumber: active.roundSequence,
        name: active.name,
        status: active.status as any,
        patterns: patternTypes.map((pt) => ({
          id: `pat_${pt}`,
          roundId: active.id,
          patternType: pt,
          enabled: true,
          maxWinners: 1,
          status: 'OPEN' as const,
          createdAt: new Date('2026-10-23T10:00:00Z'),
          updatedAt: new Date('2026-10-23T10:00:00Z'),
        })),
        createdAt: new Date('2026-10-23T10:00:00Z'),
        updatedAt: new Date('2026-10-23T10:00:00Z'),
      };
    }
    return null;
  }

  async findByEventAndSequence(
    eventId: string,
    sequenceNumber: number,
    tx?: any
  ): Promise<RoundSummary | null> {
    const client = this.getClient(tx);
    const [roundRecord] = await client
      .select()
      .from(rounds)
      .where(and(eq(rounds.eventId, eventId), eq(rounds.sequenceNumber, sequenceNumber)))
      .limit(1);

    if (!roundRecord) return null;

    const patternRecords = await client
      .select()
      .from(roundPatterns)
      .where(eq(roundPatterns.roundId, roundRecord.id));

    return this.mapRound(roundRecord, patternRecords);
  }

  async list(
    options: { page?: number; limit: number; eventId?: string; status?: RoundStatus },
    tx?: any
  ): Promise<{ data: RoundSummary[]; total: number }> {
    const client = this.getClient(tx);
    const page = options.page ?? 1;
    const offset = (page - 1) * options.limit;

    const conditions = [];
    if (options.eventId) conditions.push(eq(rounds.eventId, options.eventId));
    if (options.status) conditions.push(eq(rounds.status, options.status));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await client
      .select({ count: count() })
      .from(rounds)
      .where(whereClause);

    const total = Number(totalRow?.count || 0);

    const roundRows: RoundRecord[] = await client
      .select()
      .from(rounds)
      .where(whereClause)
      .orderBy(rounds.sequenceNumber)
      .limit(options.limit)
      .offset(offset);

    if (roundRows.length === 0) {
      return { data: [], total };
    }

    const roundIds = roundRows.map((r) => r.id);
    const patternRows: RoundPatternRecord[] = await client
      .select()
      .from(roundPatterns)
      .where(inArray(roundPatterns.roundId, roundIds));

    const patternsByRound = new Map<string, RoundPatternRecord[]>();
    for (const p of patternRows) {
      if (!patternsByRound.has(p.roundId)) {
        patternsByRound.set(p.roundId, []);
      }
      patternsByRound.get(p.roundId)!.push(p);
    }

    return {
      data: roundRows.map((r) => this.mapRound(r, patternsByRound.get(r.id) || [])),
      total,
    };
  }

  async update(
    id: string,
    roundData: Partial<InsertRound>,
    patterns?: PatternConfig[],
    tx?: any
  ): Promise<RoundSummary> {
    const client = this.getClient(tx);

    let roundRecord: RoundRecord;
    if (Object.keys(roundData).length > 0) {
      const [updated] = await client
        .update(rounds)
        .set({
          ...roundData,
          updatedAt: new Date(),
        })
        .where(eq(rounds.id, id))
        .returning();
      roundRecord = updated;
    } else {
      const [existing] = await client.select().from(rounds).where(eq(rounds.id, id)).limit(1);
      roundRecord = existing;
    }

    if (patterns !== undefined) {
      // Upsert or replace pattern configs
      for (const p of patterns) {
        await client
          .insert(roundPatterns)
          .values({
            roundId: id,
            patternType: p.patternType,
            enabled: p.enabled,
            maxWinners: p.maxWinners,
            status: 'OPEN',
          })
          .onConflictDoUpdate({
            target: [roundPatterns.roundId, roundPatterns.patternType],
            set: {
              enabled: p.enabled,
              maxWinners: p.maxWinners,
              updatedAt: new Date(),
            },
          });
      }
    }

    const patternRecords = await client
      .select()
      .from(roundPatterns)
      .where(eq(roundPatterns.roundId, id));

    return this.mapRound(roundRecord, patternRecords);
  }

  async findActiveRound(tx?: any): Promise<RoundSummary | null> {
    const client = this.getClient(tx);
    const [roundRecord] = await client
      .select()
      .from(rounds)
      .where(eq(rounds.status, 'ACTIVE'))
      .limit(1);

    if (!roundRecord) return null;

    const patternRecords = await client
      .select()
      .from(roundPatterns)
      .where(eq(roundPatterns.roundId, roundRecord.id));

    return this.mapRound(roundRecord, patternRecords);
  }

  async findCurrentRoundForEvent(eventId: string, tx?: any): Promise<RoundSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({ round: rounds, pattern: roundPatterns })
      .from(rounds)
      .leftJoin(roundPatterns, eq(roundPatterns.roundId, rounds.id))
      .where(and(eq(rounds.eventId, eventId), inArray(rounds.status, ['ACTIVE', 'PAUSED', 'READY'])))
      .orderBy(sql`CASE WHEN ${rounds.status} IN ('ACTIVE', 'PAUSED') THEN 0 ELSE 1 END`, desc(rounds.updatedAt));

    if (!rows.length) return null;

    const selectedId = rows[0]!.round.id;
    const selectedRows = rows.filter((row: { round: RoundRecord }) => row.round.id === selectedId);
    return this.mapRound(selectedRows[0]!.round, selectedRows.flatMap((row: { pattern: RoundPatternRecord | null }) => row.pattern ? [row.pattern] : []));
  }

  async findCurrentRoundForParticipant(userId: string, eventId: string, tx?: any): Promise<RoundSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({ round: rounds, pattern: roundPatterns })
      .from(participantProfiles)
      .innerJoin(rounds, and(
        eq(rounds.eventId, participantProfiles.eventId),
        inArray(rounds.status, ['ACTIVE', 'PAUSED', 'READY'])
      ))
      .leftJoin(roundPatterns, eq(roundPatterns.roundId, rounds.id))
      .where(and(eq(participantProfiles.userId, userId), eq(participantProfiles.eventId, eventId), eq(participantProfiles.status, 'ACTIVE')))
      .orderBy(sql`CASE WHEN ${rounds.status} IN ('ACTIVE', 'PAUSED') THEN 0 ELSE 1 END`, desc(rounds.updatedAt));

    if (!rows.length) return null;
    const selectedId = rows[0]!.round.id;
    const selectedRows = rows.filter((row: { round: RoundRecord }) => row.round.id === selectedId);
    return this.mapRound(selectedRows[0]!.round, selectedRows.flatMap((row: { pattern: RoundPatternRecord | null }) => row.pattern ? [row.pattern] : []));
  }

  private readonly sessionRoundQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<RoundRepository['prepareSessionRound']>>();

  private prepareSessionRound(client: ReturnType<typeof getDb>) {
    return client
      .select({ userStatus: users.status, adminRole: adminProfiles.role, profileStatus: participantProfiles.status, profileId: participantProfiles.id, round: rounds, pattern: roundPatterns })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, and(eq(participantProfiles.userId, users.id), eq(participantProfiles.eventId, placeholder('eventId'))))
      .leftJoin(rounds, and(eq(rounds.eventId, participantProfiles.eventId), inArray(rounds.status, ['ACTIVE', 'PAUSED', 'READY'])))
      .leftJoin(roundPatterns, eq(roundPatterns.roundId, rounds.id))
      .where(and(eq(sessions.id, placeholder('sessionId')), eq(sessions.userId, placeholder('userId')), isNull(sessions.revokedAt), gt(sessions.expiresAt, placeholder('now'))))
      .orderBy(sql`CASE WHEN ${rounds.status} IN ('ACTIVE', 'PAUSED') THEN 0 ELSE 1 END`, desc(rounds.updatedAt)).prepare('participant_current_round_read');
  }

  async findCurrentRoundForSession(sessionId: string, userId: string, eventId: string, tx?: any) {
    const client = this.getClient(tx);
    let query = this.sessionRoundQueries.get(client);
    if (!query) {
      query = this.prepareSessionRound(client);
      this.sessionRoundQueries.set(client, query);
    }
    const rows = await query.execute({ sessionId, userId, eventId, now: new Date().toISOString() });

    if (!rows.length) return null;
    const selectedId = rows[0]!.round?.id;
    const selectedRows = rows.filter((row: { round: RoundRecord | null }) => row.round?.id === selectedId);
    return {
      userStatus: rows[0]!.userStatus,
      adminRole: rows[0]!.adminRole,
      profileId: rows[0]!.profileId,
      profileStatus: rows[0]!.profileStatus,
      round: selectedId ? this.mapRound(rows[0]!.round!, selectedRows.flatMap((row: { pattern: RoundPatternRecord | null }) => row.pattern ? [row.pattern] : [])) : null,
    };
  }

  async getReadinessMetrics(
    roundId: string,
    eventId: string,
    tx?: any
  ): Promise<{ questionCount: number; activeParticipantsCount: number; ticketsCount: number }> {
    const client = this.getClient(tx);

    const [qRow] = await client
      .select({ count: count() })
      .from(roundQuestions)
      .where(eq(roundQuestions.roundId, roundId));

    const [pRow] = await client
      .select({ count: count() })
      .from(participantProfiles)
      .where(and(eq(participantProfiles.eventId, eventId), eq(participantProfiles.status, 'ACTIVE')));

    const [tRow] = await client
      .select({ count: count() })
      .from(tickets)
      .where(eq(tickets.roundId, roundId));

    return {
      questionCount: Number(qRow?.count || 0),
      activeParticipantsCount: Number(pRow?.count || 0),
      ticketsCount: Number(tRow?.count || 0),
    };
  }

  async acquireGlobalActiveLock(tx: any): Promise<void> {
    const client = this.getClient(tx);
    await client.execute(sql`SELECT pg_advisory_xact_lock(hashtext('global_active_round_lock'));`);
  }
}

export const roundRepository = new RoundRepository();
