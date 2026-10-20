import { index, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { rounds } from './rounds.ts';
import { participantProfiles, users } from './users.ts';
import { tickets } from './tickets.ts';
import { events } from './events.ts';

export const claims = pgTable(
  'claims',
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
    status: varchar('status', { length: 50 }).notNull().default('PENDING_VERIFICATION'),
    rejectionReason: varchar('rejection_reason', { length: 255 }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'restrict' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_claims_round_participant_pattern').on(table.roundId, table.participantId, table.patternType),
    index('claims_round_id_idx').on(table.roundId),
    index('claims_participant_id_idx').on(table.participantId),
    index('claims_ticket_id_idx').on(table.ticketId),
    index('claims_round_pattern_status_idx').on(table.roundId, table.patternType, table.status),
  ]
);

export type ClaimRecord = typeof claims.$inferSelect;
export type InsertClaim = typeof claims.$inferInsert;

export const winners = pgTable(
  'winners',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    claimId: uuid('claim_id').notNull().unique().references(() => claims.id, { onDelete: 'restrict' }),
    participantId: uuid('participant_id').notNull().references(() => participantProfiles.id, { onDelete: 'restrict' }),
    roundId: uuid('round_id').notNull().references(() => rounds.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'restrict' }),
    patternType: varchar('pattern_type', { length: 50 }).notNull(),
    verifiedBy: uuid('verified_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('winners_participant_verified_at_idx').on(table.participantId, table.verifiedAt),
    index('winners_verified_at_idx').on(table.verifiedAt),
    index('winners_round_pattern_idx').on(table.roundId, table.patternType),
    index('winners_round_pattern_verified_idx').on(table.roundId, table.patternType, table.verifiedAt, table.id),
  ]
);

export type WinnerRecord = typeof winners.$inferSelect;
export type InsertWinner = typeof winners.$inferInsert;
