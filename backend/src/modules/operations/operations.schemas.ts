import { z } from 'zod';

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
  roundId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  actorEmail: z.string().trim().min(1).max(255).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).strict().refine((query) => !query.from || !query.to || query.from <= query.to, {
  message: 'from must be before or equal to to',
  path: ['from'],
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
