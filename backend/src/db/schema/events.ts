import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('events_status_idx').on(table.status),
    index('events_created_at_idx').on(table.createdAt),
    index('events_live_started_at_idx').on(table.status, table.startedAt.desc().nullsLast(), table.id.desc()),
  ]
);

export type EventRecord = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
