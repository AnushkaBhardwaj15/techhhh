import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    responsePayload: jsonb('response_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idempotency_keys_created_at_idx').on(table.createdAt)]
);

export type IdempotencyRecord = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotency = typeof idempotencyKeys.$inferInsert;
