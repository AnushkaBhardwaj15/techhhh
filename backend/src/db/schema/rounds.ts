import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { events } from './events.ts';

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    sequenceNumber: integer('sequence_number').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_rounds_event_sequence').on(table.eventId, table.sequenceNumber),
    index('rounds_event_id_idx').on(table.eventId),
    index('rounds_status_idx').on(table.status),
  ]
);

export const roundPatterns = pgTable(
  'round_patterns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    patternType: varchar('pattern_type', { length: 50 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    maxWinners: integer('max_winners').notNull().default(1),
    status: varchar('status', { length: 50 }).notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_round_patterns_round_type').on(table.roundId, table.patternType),
    index('round_patterns_round_id_idx').on(table.roundId),
    check('round_patterns_enabled_max_winners_positive', sql`NOT ${table.enabled} OR ${table.maxWinners} >= 1`),
  ]
);

export type RoundRecord = typeof rounds.$inferSelect;
export type InsertRound = typeof rounds.$inferInsert;
export type RoundPatternRecord = typeof roundPatterns.$inferSelect;
export type InsertRoundPattern = typeof roundPatterns.$inferInsert;
