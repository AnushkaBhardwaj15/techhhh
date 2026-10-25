import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });

export const auditRecordSchema = z.strictObject({
  id: z.string(),
  actorId: z.string().nullable().optional(),
  actorEmail: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
  actorType: z.string().nullable().optional(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable().optional(),
  eventName: z.string().nullable().optional(),
  resourceName: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
  createdAt: z.string(),
});

export const auditPageSchema = z.strictObject({
  items: z.array(auditRecordSchema),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
});

export const systemStatusSchema = z.strictObject({
  version: z.string(),
  readiness: z.strictObject({
    status: z.enum(['ready', 'not_ready']),
    dependencies: z.record(z.string(), z.string()),
  }),
  recoveryRequiredRounds: z.number().int().nonnegative().nullable(),
  latestMigration: z.strictObject({ version: z.string(), appliedAt: timestamp }).nullable(),
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;
export type AuditPage = z.infer<typeof auditPageSchema>;
export type SystemStatus = z.infer<typeof systemStatusSchema>;
