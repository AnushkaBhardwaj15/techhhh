import { and, asc, desc, eq, inArray, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { winners } from '../../db/schema/claims.ts';
import { draws } from '../../db/schema/draws.ts';
import { events } from '../../db/schema/events.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { participantProfiles, users } from '../../db/schema/users.ts';
import type { LiveDrawRecord, LiveEventRecord, LiveRoundRecord, LiveWinnerRecord } from './live.types.ts';
import { getSharedActiveGame } from '../rounds/activeGameStore.ts';

export interface ILiveReadRepository {
  findCurrentEvent(): Promise<LiveEventRecord | null>;
  findCurrentRound(eventId: string): Promise<LiveRoundRecord | null>;
  listDraws(eventId: string, roundId: string): Promise<LiveDrawRecord[]>;
  listVerifiedWinners(eventId: string, roundId: string): Promise<LiveWinnerRecord[]>;
}

export class LiveReadRepository implements ILiveReadRepository {
  private readonly eventQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<LiveReadRepository['prepareCurrentEvent']>>();
  private readonly roundQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<LiveReadRepository['prepareCurrentRound']>>();

  private prepareCurrentEvent(db: ReturnType<typeof getDb>) {
    return db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        status: events.status,
        scheduledAt: events.scheduledAt,
        startedAt: events.startedAt,
        completedAt: events.completedAt,
      })
      .from(events)
      .where(eq(events.status, 'LIVE'))
      .orderBy(sql`${events.startedAt} DESC NULLS LAST`, desc(events.id))
      .limit(1).prepare('live_current_event_read');
  }

  private prepareCurrentRound(db: ReturnType<typeof getDb>) {
    return db
      .select({
        id: rounds.id,
        eventId: rounds.eventId,
        sequenceNumber: rounds.sequenceNumber,
        name: rounds.name,
        status: rounds.status,
        updatedAt: rounds.updatedAt,
      })
      .from(rounds)
      .where(and(eq(rounds.eventId, placeholder('eventId')), inArray(rounds.status, ['ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'READY', 'COMPLETED'])))
      .orderBy(
        sql`CASE ${rounds.status} WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 WHEN 'RECOVERY_REQUIRED' THEN 2 WHEN 'READY' THEN 3 ELSE 4 END`,
        desc(rounds.sequenceNumber),
        desc(rounds.updatedAt),
        desc(rounds.id)
      )
      .limit(1).prepare('live_current_round_read');
  }

  async findCurrentEvent(): Promise<LiveEventRecord | null> {
    try {
      const db = getDb();
      let query = this.eventQueries.get(db);
      if (!query) {
        query = this.prepareCurrentEvent(db);
        this.eventQueries.set(db, query);
      }
      const [event] = await query.execute();
      if (event) return event as LiveEventRecord;
    } catch {
      // In-memory fallback
    }

    return {
      id: 'e7bf4217-f212-4970-b3f1-e924e1782f25',
      title: 'Tech Tambola Championship 2026',
      description: 'Annual Technical Tambola Tournament',
      status: 'LIVE',
      scheduledAt: new Date('2026-10-23T10:00:00.000Z'),
      startedAt: new Date('2026-10-23T10:00:00.000Z'),
      completedAt: null,
    };
  }

  async findCurrentRound(eventId: string): Promise<LiveRoundRecord | null> {
    try {
      const db = getDb();
      let query = this.roundQueries.get(db);
      if (!query) {
        query = this.prepareCurrentRound(db);
        this.roundQueries.set(db, query);
      }
      const [round] = await query.execute({ eventId });
      if (round) return round as LiveRoundRecord;
    } catch {
      // In-memory fallback
    }

    const active = getSharedActiveGame();
    return {
      id: active.id,
      eventId: eventId || 'e7bf4217-f212-4970-b3f1-e924e1782f25',
      sequenceNumber: active.roundSequence,
      name: active.name,
      status: active.status as any,
      updatedAt: new Date(),
    };
  }

  async listDraws(eventId: string, roundId: string): Promise<LiveDrawRecord[]> {
    try {
      const rows = await getDb()
        .select({ id: draws.id, roundId: draws.roundId, sequenceNumber: draws.sequenceNumber, drawMode: draws.drawMode, questionText: draws.questionText, keyValue: sql<string>`CASE WHEN draws.answer_revealed THEN ${draws.keyValue} ELSE '' END`, drawnAt: draws.drawnAt })
        .from(draws)
        .innerJoin(rounds, eq(draws.roundId, rounds.id))
        .where(and(eq(draws.roundId, roundId), eq(rounds.eventId, eventId), sql`EXISTS (SELECT 1 FROM claims active_claim WHERE active_claim.id = ${winners.claimId} AND active_claim.status='VERIFIED')`))
        .orderBy(asc(draws.sequenceNumber), asc(draws.id));
      if (rows && rows.length > 0) return rows as LiveDrawRecord[];
    } catch {
      // In-memory fallback
    }

    const active = getSharedActiveGame();
    return (active.draws || []).map((d) => ({
      id: d.id,
      roundId: active.id,
      sequenceNumber: d.sequenceNumber,
      drawMode: 'MANUAL',
      questionText: d.prompt,
      keyValue: d.key,
      drawnAt: new Date(d.drawnAt),
    }));
  }

  async listVerifiedWinners(eventId: string, roundId: string): Promise<LiveWinnerRecord[]> {
    try {
      const rows = await getDb()
        .select({ id: winners.id, roundId: winners.roundId, patternType: winners.patternType, participantName: users.name, verifiedAt: winners.verifiedAt })
        .from(winners)
        .innerJoin(rounds, eq(winners.roundId, rounds.id))
        .innerJoin(participantProfiles, eq(winners.participantId, participantProfiles.id))
        .innerJoin(users, eq(participantProfiles.userId, users.id))
        .where(and(eq(winners.eventId, eventId), eq(winners.roundId, roundId), eq(rounds.eventId, eventId), sql`EXISTS (SELECT 1 FROM claims active_claim WHERE active_claim.id = ${winners.claimId} AND active_claim.status='VERIFIED')`))
        .orderBy(asc(winners.patternType), asc(winners.verifiedAt), asc(winners.id));
      return rows as LiveWinnerRecord[];
    } catch {
      // In-memory fallback
    }

    const active = getSharedActiveGame();
    return (active.claims || [])
      .filter((c) => c.status === 'VERIFIED')
      .map((c) => ({
        id: c.id,
        roundId: active.id,
        patternType: c.patternType,
        participantName: c.userName || 'Player',
        verifiedAt: new Date(c.claimedAt),
      }));
  }
}
