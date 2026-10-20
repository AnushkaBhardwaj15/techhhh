import { z } from 'zod';

export const adminEventStatusSchema = z.enum(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']);

export const adminEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: adminEventStatusSchema,
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminEventListSchema = z.object({
  data: z.array(adminEventSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
});

export const createAdminEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const updateAdminEventSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  status: adminEventStatusSchema.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: 'At least one metadata field to update must be provided' });

export type AdminEvent = z.infer<typeof adminEventSchema>;
export type AdminEventList = z.infer<typeof adminEventListSchema>;
export type CreateAdminEvent = z.infer<typeof createAdminEventSchema>;
export type UpdateAdminEvent = z.infer<typeof updateAdminEventSchema>;
