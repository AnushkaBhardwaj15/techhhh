import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../db/client.ts';
import { draws } from '../../db/schema/draws.ts';
import { rounds } from '../../db/schema/rounds.ts';
import {
  eventKeys,
  roundQuestions,
  type EventKeyRecord,
  type RoundQuestionRecord,
} from '../../db/schema/questions.ts';
import type {
  KeyListRow,
  KeySummary,
  QuestionListRow,
  QuestionSummary,
} from './question.types.ts';

export interface IQuestionRepository {
  createKey(eventId: string, value: string, normalizedValue: string, tx?: any): Promise<KeySummary>;
  findKeyById(id: string, tx?: any): Promise<KeySummary | null>;
  findKeyByEventAndNormalized(eventId: string, normalizedValue: string, tx?: any): Promise<KeySummary | null>;
  listKeys(options: { page: number; limit: number; eventId?: string; search?: string; used?: boolean }, tx?: any): Promise<{ data: KeyListRow[]; total: number }>;
  updateKey(id: string, value: string, normalizedValue: string, tx?: any): Promise<KeySummary>;

  createQuestion(roundId: string, keyId: string, questionText: string, tx?: any): Promise<QuestionSummary>;
  findQuestionById(id: string, tx?: any): Promise<QuestionSummary | null>;
  findQuestionByRoundAndKey(roundId: string, keyId: string, tx?: any): Promise<QuestionSummary | null>;
  listQuestions(options: { page: number; limit: number; roundId?: string; search?: string; used?: boolean }, tx?: any): Promise<{ data: QuestionListRow[]; total: number }>;
  updateQuestion(id: string, questionText: string, tx?: any): Promise<QuestionSummary>;
  deleteQuestion(id: string, tx?: any): Promise<void>;
  isKeyReferencedInQuestions(keyId: string, tx?: any): Promise<boolean>;
}

export class QuestionRepository implements IQuestionRepository {
  private getClient(tx?: any) {
    return tx || getDb();
  }

  private mapKey(r: EventKeyRecord): KeySummary {
    return {
      id: r.id,
      eventId: r.eventId,
      value: r.value,
      normalizedValue: r.normalizedValue,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async createKey(eventId: string, value: string, normalizedValue: string, tx?: any): Promise<KeySummary> {
    const client = this.getClient(tx);
    const [record] = await client
      .insert(eventKeys)
      .values({
        eventId,
        value,
        normalizedValue,
      })
      .returning();

    return this.mapKey(record);
  }

  async findKeyById(id: string, tx?: any): Promise<KeySummary | null> {
    const client = this.getClient(tx);
    const [record] = await client.select().from(eventKeys).where(eq(eventKeys.id, id)).limit(1);
    return record ? this.mapKey(record) : null;
  }

  async findKeyByEventAndNormalized(
    eventId: string,
    normalizedValue: string,
    tx?: any
  ): Promise<KeySummary | null> {
    const client = this.getClient(tx);
    const [record] = await client
      .select()
      .from(eventKeys)
      .where(and(eq(eventKeys.eventId, eventId), eq(eventKeys.normalizedValue, normalizedValue)))
      .limit(1);

    return record ? this.mapKey(record) : null;
  }

  async listKeys(
    options: { page: number; limit: number; eventId?: string; search?: string; used?: boolean },
    tx?: any
  ): Promise<{ data: KeyListRow[]; total: number }> {
    const client = this.getClient(tx);
    const offset = (options.page - 1) * options.limit;

    const usedExpression = sql<boolean>`EXISTS (
      SELECT 1
      FROM draws
      INNER JOIN round_questions ON draws.question_id = round_questions.id
      WHERE round_questions.key_id = event_keys.id
    )`;
    const canEditExpression = sql<boolean>`NOT EXISTS (
      SELECT 1 FROM round_questions
      WHERE round_questions.key_id = event_keys.id
    )`;
    const conditions = [
      options.eventId ? eq(eventKeys.eventId, options.eventId) : undefined,
      options.search
        ? sql`strpos(lower(${eventKeys.normalizedValue}), lower(${options.search})) > 0`
        : undefined,
      options.used === undefined
        ? undefined
        : options.used
          ? usedExpression
          : sql`not ${usedExpression}`,
    ].filter(Boolean);
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await client
      .select({ count: count() })
      .from(eventKeys)
      .where(whereClause);

    const total = Number(totalRow?.count || 0);

    const rows = await client
      .select({ key: eventKeys, used: usedExpression, canEdit: canEditExpression })
      .from(eventKeys)
      .where(whereClause)
      .orderBy(desc(eventKeys.createdAt), asc(eventKeys.id))
      .limit(options.limit)
      .offset(offset);

    return {
      data: rows.map(({ key, used, canEdit }: any) => ({
        ...this.mapKey(key),
        used,
        canEdit,
      })),
      total,
    };
  }

  async updateKey(
    id: string,
    value: string,
    normalizedValue: string,
    tx?: any
  ): Promise<KeySummary> {
    const client = this.getClient(tx);
    const [record] = await client
      .update(eventKeys)
      .set({
        value,
        normalizedValue,
        updatedAt: new Date(),
      })
      .where(eq(eventKeys.id, id))
      .returning();

    return this.mapKey(record);
  }

  async createQuestion(
    roundId: string,
    keyId: string,
    questionText: string,
    tx?: any
  ): Promise<QuestionSummary> {
    const client = this.getClient(tx);
    const [record] = await client
      .insert(roundQuestions)
      .values({
        roundId,
        keyId,
        questionText,
      })
      .returning();

    const [key] = await client.select().from(eventKeys).where(eq(eventKeys.id, keyId)).limit(1);

    return {
      id: record.id,
      roundId: record.roundId,
      keyId: record.keyId,
      keyValue: key?.value || '',
      questionText: record.questionText,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findQuestionById(id: string, tx?: any): Promise<QuestionSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        question: roundQuestions,
        key: eventKeys,
      })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .where(eq(roundQuestions.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const { question, key } = rows[0];

    return {
      id: question.id,
      roundId: question.roundId,
      keyId: question.keyId,
      keyValue: key.value,
      questionText: question.questionText,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  async findQuestionByRoundAndKey(
    roundId: string,
    keyId: string,
    tx?: any
  ): Promise<QuestionSummary | null> {
    const client = this.getClient(tx);
    const rows = await client
      .select({
        question: roundQuestions,
        key: eventKeys,
      })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .where(and(eq(roundQuestions.roundId, roundId), eq(roundQuestions.keyId, keyId)))
      .limit(1);

    if (rows.length === 0) return null;
    const { question, key } = rows[0];

    return {
      id: question.id,
      roundId: question.roundId,
      keyId: question.keyId,
      keyValue: key.value,
      questionText: question.questionText,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    };
  }

  async listQuestions(
    options: { page: number; limit: number; roundId?: string; search?: string; used?: boolean },
    tx?: any
  ): Promise<{ data: QuestionListRow[]; total: number }> {
    const client = this.getClient(tx);
    const offset = (options.page - 1) * options.limit;

    const usedExpression = sql<boolean>`EXISTS (
      SELECT 1 FROM draws
      WHERE draws.question_id = round_questions.id
    )`;
    const conditions = [
      options.roundId ? eq(roundQuestions.roundId, options.roundId) : undefined,
      options.search
        ? sql`(
            strpos(lower(${roundQuestions.questionText}), lower(${options.search})) > 0
            or strpos(lower(${eventKeys.value}), lower(${options.search})) > 0
          )`
        : undefined,
      options.used === undefined
        ? undefined
        : options.used
          ? usedExpression
          : sql`not ${usedExpression}`,
    ].filter(Boolean);
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [totalRow] = await client
      .select({ count: count() })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .innerJoin(rounds, eq(roundQuestions.roundId, rounds.id))
      .where(whereClause);

    const total = Number(totalRow?.count || 0);

    const rows = await client
      .select({
        question: roundQuestions,
        key: eventKeys,
        round: rounds,
        used: usedExpression,
      })
      .from(roundQuestions)
      .innerJoin(eventKeys, eq(roundQuestions.keyId, eventKeys.id))
      .innerJoin(rounds, eq(roundQuestions.roundId, rounds.id))
      .where(whereClause)
      .orderBy(desc(roundQuestions.createdAt), asc(roundQuestions.id))
      .limit(options.limit)
      .offset(offset);

    return {
      data: rows.map(({ question, key, round, used }: any) => ({
        id: question.id,
        roundId: question.roundId,
        keyId: question.keyId,
        keyValue: key.value,
        questionText: question.questionText,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        used,
        canEdit: round.status === 'DRAFT',
      })),
      total,
    };
  }

  async updateQuestion(id: string, questionText: string, tx?: any): Promise<QuestionSummary> {
    const client = this.getClient(tx);
    const [updated] = await client
      .update(roundQuestions)
      .set({
        questionText,
        updatedAt: new Date(),
      })
      .where(eq(roundQuestions.id, id))
      .returning();

    const [key] = await client.select().from(eventKeys).where(eq(eventKeys.id, updated.keyId)).limit(1);

    return {
      id: updated.id,
      roundId: updated.roundId,
      keyId: updated.keyId,
      keyValue: key?.value || '',
      questionText: updated.questionText,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteQuestion(id: string, tx?: any): Promise<void> {
    const client = this.getClient(tx);
    await client.delete(roundQuestions).where(eq(roundQuestions.id, id));
  }

  async isKeyReferencedInQuestions(keyId: string, tx?: any): Promise<boolean> {
    const client = this.getClient(tx);
    const [record] = await client
      .select({ id: roundQuestions.id })
      .from(roundQuestions)
      .where(eq(roundQuestions.keyId, keyId))
      .limit(1);

    return !!record;
  }
}

export const questionRepository = new QuestionRepository();
