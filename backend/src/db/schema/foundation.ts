import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const schemaMigrations = pgTable('schema_migrations', {
  version: varchar('version', { length: 255 }).primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
});

export const healthCheckFixtures = pgTable('health_check_fixtures', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
