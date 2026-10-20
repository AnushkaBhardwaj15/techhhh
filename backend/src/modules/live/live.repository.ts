import { and, asc, desc, eq, inArray, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { winners } from '../../db/schema/claims.ts';
import { draws } from '../../db/schema/draws.ts';
import { events } from '../../db/schema/events.ts';
import { rounds } from '../../db/schema/rounds.ts';
import { participantProfiles, users } from '../../db/schema/users.ts';
import type { LiveDrawRecord, LiveEventRecord, LiveRoundRecord, LiveWinnerRecord } from './live.types.ts';

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
    const db = getDb();
    let query = this.eventQueries.get(db);
    if (!query) {
      query = this.prepareCurrentEvent(db);
      this.eventQueries.set(db, query);
    }
    const [event] = await query.execute();
    return event as LiveEventRecord | undefined ?? null;
  }

  async findCurrentRound(eventId: string): Promise<LiveRoundRecord | null> {
    const db = getDb();
    let query = this.roundQueries.get(db);
    if (!query) {
      query = this.prepareCurrentRound(db);
      this.roundQueries.set(db, query);
    }
    const [round] = await query.execute({ eventId });
    return round as LiveRoundRecord | undefined ?? null;
  }

  async listDraws(eventId: string, roundId: string): Promise<LiveDrawRecord[]> {
    return getDb()
      .select({ id: draws.id, roundId: draws.roundId, sequenceNumber: draws.sequenceNumber, drawMode: draws.drawMode, questionText: draws.questionText, keyValue: draws.keyValue, drawnAt: draws.drawnAt })
      .from(draws)
      .innerJoin(rounds, eq(draws.roundId, rounds.id))
      .where(and(eq(draws.roundId, roundId), eq(rounds.eventId, eventId)))
      .orderBy(asc(draws.sequenceNumber), asc(draws.id)) as Promise<LiveDrawRecord[]>;
  }

  async listVerifiedWinners(eventId: string, roundId: string): Promise<LiveWinnerRecord[]> {
    return getDb()
      .select({ id: winners.id, roundId: winners.roundId, patternType: winners.patternType, participantName: users.name, verifiedAt: winners.verifiedAt })
      .from(winners)
      .innerJoin(rounds, eq(winners.roundId, rounds.id))
      .innerJoin(participantProfiles, eq(winners.participantId, participantProfiles.id))
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(and(eq(winners.eventId, eventId), eq(winners.roundId, roundId), eq(rounds.eventId, eventId)))
      .orderBy(asc(winners.patternType), asc(winners.verifiedAt), asc(winners.id)) as Promise<LiveWinnerRecord[]>;
  }
}
