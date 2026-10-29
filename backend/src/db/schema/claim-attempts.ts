import { check, index, integer, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { rounds } from './rounds.ts';
import { participantProfiles } from './users.ts';
import { tickets } from './tickets.ts';

export const claimAttempts = pgTable(
  'claim_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'restrict' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participantProfiles.id, { onDelete: 'restrict' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'restrict' }),
    patternType: varchar('pattern_type', { length: 50 }).notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    rejectionReason: varchar('rejection_reason', { length: 255 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('check_attempt_number_range', sql`${table.attemptNumber} BETWEEN 1 AND 3`),
    unique('uq_claim_attempts_limit').on(table.roundId, table.participantId, table.patternType, table.attemptNumber),
    index('idx_claim_attempts_lookup').on(table.roundId, table.participantId, table.patternType),
  ]
);

export type ClaimAttemptRecord = typeof claimAttempts.$inferSelect;
export type InsertClaimAttempt = typeof claimAttempts.$inferInsert;
