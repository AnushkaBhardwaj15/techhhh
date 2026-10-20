import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { events } from './events.ts';
import { rounds } from './rounds.ts';

export const eventKeys = pgTable(
  'event_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    value: varchar('value', { length: 50 }).notNull(),
    normalizedValue: varchar('normalized_value', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_event_keys_event_normalized').on(table.eventId, table.normalizedValue),
    index('event_keys_event_id_idx').on(table.eventId),
  ]
);

export const roundQuestions = pgTable(
  'round_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    keyId: uuid('key_id')
      .notNull()
      .references(() => eventKeys.id, { onDelete: 'restrict' }),
    questionText: varchar('question_text', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_round_questions_round_key').on(table.roundId, table.keyId),
    index('round_questions_round_id_idx').on(table.roundId),
    index('round_questions_key_id_idx').on(table.keyId),
  ]
);

export type EventKeyRecord = typeof eventKeys.$inferSelect;
export type InsertEventKey = typeof eventKeys.$inferInsert;
export type RoundQuestionRecord = typeof roundQuestions.$inferSelect;
export type InsertRoundQuestion = typeof roundQuestions.$inferInsert;
