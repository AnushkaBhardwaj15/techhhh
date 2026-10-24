import { getTableColumns, and, asc, count, desc, eq, gt, inArray, isNull, placeholder, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { draws, type DrawRecord, type InsertDraw } from '../../db/schema/draws.ts';
import { roundQuestions, eventKeys } from '../../db/schema/questions.ts';
import { rounds, type RoundRecord } from '../../db/schema/rounds.ts';
import { adminProfiles, participantProfiles, sessions, users } from '../../db/schema/users.ts';
import type { CandidateQuestion } from './draw.domain.ts';

type ParticipantHistoryDraw = Pick<DrawRecord, 'id' | 'roundId' | 'sequenceNumber' | 'drawMode' | 'questionText' | 'keyValue' | 'drawnAt'>;

export interface IDrawRepository {
  create(data: InsertDraw, tx?: any): Promise<DrawRecord>;
  getLastDraw(roundId: string, tx?: any): Promise<DrawRecord | null>;
  getDrawnQuestionIds(roundId: string, tx?: any): Promise<Set<string>>;
  getDrawnKeyIds(roundId: string, tx?: any): Promise<Set<string>>;
  listDrawnKeysBySequence(roundId: string, tx?: any): Promise<Array<{ keyId: string; sequenceNumber: number }>>;
  getCandidateQuestions(roundId: string, tx?: any): Promise<CandidateQuestion[]>;
  listByRound(
    roundId: string,
    options?: { page?: number; limit?: number; order?: 'ASC' | 'DESC' },
    tx?: any
  ): Promise<{ data: DrawRecord[]; total: number }>;
  listForParticipantSession(
    sessionId: string,
    userId: string,
    roundId: string | undefined,
    eventId: string,
    options?: { page?: number; limit?: number }
  ): Promise<{
    userStatus: string;
    adminRole: string | null;
    profileStatus: string | null;
    roundFound: boolean;
    data: ParticipantHistoryDraw[];
    total: number;
  } | null>;
  lockRoundForDraw(roundId: string, tx: any): Promise<RoundRecord | null>;
}

export class DrawRepository implements IDrawRepository {
  private getDbInstance(tx?: any) {
    return tx || getDb();
  }

  async create(data: InsertDraw, tx?: any): Promise<DrawRecord> {
    const db = this.getDbInstance(tx);
    const [created] = await db.insert(draws).values(data).returning();
    return created;
  }

  async getLastDraw(roundId: string, tx?: any): Promise<DrawRecord | null> {
    const db = this.getDbInstance(tx);
    const [last] = await db
      .select()
      .from(draws)
      .where(eq(draws.roundId, roundId))
      .orderBy(desc(draws.sequenceNumber))
      .limit(1);
    return last || null;
  }

  async getDrawnQuestionIds(roundId: string, tx?: any): Promise<Set<string>> {
    const db = this.getDbInstance(tx);
    const rows = await db
      .select({ questionId: draws.questionId })
      .from(draws)
      .where(eq(draws.roundId, roundId));
    return new Set(rows.map((r: { questionId: string }) => r.questionId));
  }

  async getDrawnKeyIds(roundId: string, tx?: any): Promise<Set<string>> {
    const db = this.getDbInstance(tx);
    const rows = await db
      .select({ keyId: draws.keyId })
      .from(draws)
      .where(eq(draws.roundId, roundId));
    return new Set(rows.map((r: { keyId: string }) => r.keyId));
  }

  async listDrawnKeysBySequence(
    roundId: string,
    tx?: any
  ): Promise<Array<{ keyId: string; sequenceNumber: number }>> {
    const db = this.getDbInstance(tx);
    return db
      .select({ keyId: draws.keyId, sequenceNumber: draws.sequenceNumber })
      .from(draws)
      .where(eq(draws.roundId, roundId))
      .orderBy(asc(draws.sequenceNumber));
  }

  async getCandidateQuestions(roundId: string, tx?: any): Promise<CandidateQuestion[]> {
    const db = this.getDbInstance(tx);
    const rows = await db
      .select({
        id: roundQuestions.id,
        roundId: roundQuestions.roundId,
        keyId: roundQuestions.keyId,
        questionText: roundQuestions.questionText,
        keyValue: eventKeys.value,
      })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .where(eq(roundQuestions.roundId, roundId));

    return rows;
  }

  async listByRound(
    roundId: string,
    options: { page?: number; limit?: number; order?: 'ASC' | 'DESC' } = {},
    tx?: any
  ): Promise<{ data: DrawRecord[]; total: number }> {
    const db = this.getDbInstance(tx);
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const offset = (page - 1) * limit;
    const orderDirection = options.order === 'DESC' ? desc(draws.sequenceNumber) : asc(draws.sequenceNumber);

    const rows = await db
      .select({ draw: { ...getTableColumns(draws), keyValue: sql<string>`CASE WHEN draws.answer_revealed THEN ${draws.keyValue} ELSE '' END` }, total: sql<number>`count(*) over()` })
      .from(draws)
      .where(eq(draws.roundId, roundId))
      .orderBy(orderDirection)
      .limit(limit)
      .offset(offset);

    const total = Number(rows[0]?.total ?? 0);
    if (rows.length === 0 && offset > 0) {
      const [totalRes] = await db.select({ count: count() }).from(draws).where(eq(draws.roundId, roundId));
      return { data: [], total: Number(totalRes?.count ?? 0) };
    }

    return { data: rows.map((row: { draw: DrawRecord }) => row.draw), total };
  }

  private readonly sessionDrawQueries = new WeakMap<ReturnType<typeof getDb>, ReturnType<DrawRepository['prepareSessionDraws']>>();

  private prepareSessionDraws(db: ReturnType<typeof getDb>) {
    const where = and(eq(sessions.id, placeholder('sessionId')), eq(sessions.userId, placeholder('userId')), isNull(sessions.revokedAt), gt(sessions.expiresAt, placeholder('now')));
    const joinScope = and(
      sql`((${placeholder('roundId')}::uuid IS NOT NULL AND ${rounds.id} = ${placeholder('roundId')}::uuid) OR (${placeholder('roundId')}::uuid IS NULL AND ${rounds.status} IN ('ACTIVE', 'PAUSED', 'READY', 'COMPLETED')))`,
      eq(rounds.eventId, participantProfiles.eventId)
    );
    return db
      .select({
        userStatus: users.status,
        adminRole: adminProfiles.role,
        profileStatus: participantProfiles.status,
        roundId: rounds.id,
        data: sql<ParticipantHistoryDraw[]>`(
          SELECT COALESCE(json_agg(draw_page.payload ORDER BY draw_page.sequence_number), '[]'::json)
          FROM (
            SELECT ${draws.sequenceNumber} AS sequence_number, json_build_object(
            'id', ${draws.id},
            'roundId', ${draws.roundId},
            'sequenceNumber', ${draws.sequenceNumber},
            'drawMode', ${draws.drawMode},
            'questionText', ${draws.questionText},
            'keyValue', CASE WHEN draws.answer_revealed THEN ${draws.keyValue} ELSE '' END,
            'drawnAt', ${draws.drawnAt}
            ) AS payload
            FROM ${draws}
            WHERE ${draws.roundId} = ${rounds.id}
            ORDER BY ${draws.sequenceNumber}
            LIMIT ${placeholder('limit')} OFFSET ${placeholder('offset')}
          ) AS draw_page
        )`,
        total: sql<number>`(SELECT count(*)::int FROM ${draws} WHERE ${draws.roundId} = ${rounds.id})`,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
      .leftJoin(participantProfiles, and(eq(participantProfiles.userId, users.id), eq(participantProfiles.eventId, placeholder('eventId'))))
      .leftJoin(rounds, joinScope)
      .where(where)
      .orderBy(sql`CASE WHEN ${rounds.status} IN ('ACTIVE', 'PAUSED') THEN 0 ELSE 1 END`, desc(rounds.updatedAt))
      .limit(1).prepare('participant_draw_history_read');
  }

  async listForParticipantSession(sessionId: string, userId: string, roundId: string | undefined, eventId: string, options: { page?: number; limit?: number } = {}) {
    const db = getDb();
    let query = this.sessionDrawQueries.get(db);
    if (!query) {
      query = this.prepareSessionDraws(db);
      this.sessionDrawQueries.set(db, query);
    }
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const rows = await query.execute({ sessionId, userId, roundId: roundId ?? null, eventId, now: new Date().toISOString(), limit, offset: (page - 1) * limit });

    if (rows.length) {
      const data = rows[0]!.data.map((draw: ParticipantHistoryDraw) => ({
        ...draw,
        drawnAt: new Date(draw.drawnAt),
      }));
      return {
        userStatus: rows[0]!.userStatus,
        adminRole: rows[0]!.adminRole,
        profileStatus: rows[0]!.profileStatus,
        roundFound: rows[0]!.roundId !== null,
        data,
        total: Number(rows[0]!.total ?? 0),
      };
    }

    return null;
  }

  async lockRoundForDraw(roundId: string, tx: any): Promise<RoundRecord | null> {
    // Select with FOR UPDATE to serialize all draws for this round
    const rows = await tx
      .select()
      .from(rounds)
      .where(eq(rounds.id, roundId))
      .for('update');

    return rows[0] || null;
  }
}

export const drawRepository = new DrawRepository();
