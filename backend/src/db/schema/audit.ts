import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    actorType: varchar('actor_type', { length: 50 }),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 255 }),
    metadata: jsonb('metadata'),
    ip: varchar('ip', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_actor_id_idx').on(table.actorId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  ]
);

export type AuditLogRecord = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
