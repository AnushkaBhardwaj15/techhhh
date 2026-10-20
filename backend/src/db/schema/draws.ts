import { integer, index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { rounds } from './rounds.ts';
import { roundQuestions, eventKeys } from './questions.ts';
import { users } from './users.ts';

export const draws = pgTable(
  'draws',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'restrict' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => roundQuestions.id, { onDelete: 'restrict' }),
    keyId: uuid('key_id')
      .notNull()
      .references(() => eventKeys.id, { onDelete: 'restrict' }),
    sequenceNumber: integer('sequence_number').notNull(),
    drawMode: varchar('draw_mode', { length: 20 }).notNull(),
    questionText: varchar('question_text', { length: 500 }).notNull(),
    keyValue: varchar('key_value', { length: 50 }).notNull(),
    drawnBy: uuid('drawn_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    drawnAt: timestamp('drawn_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_draws_round_sequence').on(table.roundId, table.sequenceNumber),
    unique('uq_draws_round_question').on(table.roundId, table.questionId),
    unique('uq_draws_round_key').on(table.roundId, table.keyId),
    index('draws_round_id_idx').on(table.roundId),
    index('draws_round_id_sequence_idx').on(table.roundId, table.sequenceNumber),
    index('draws_question_id_idx').on(table.questionId),
    index('draws_key_id_idx').on(table.keyId),
  ]
);

export type DrawRecord = typeof draws.$inferSelect;
export type InsertDraw = typeof draws.$inferInsert;
