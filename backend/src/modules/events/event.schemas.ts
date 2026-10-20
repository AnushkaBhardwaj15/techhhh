import { z } from 'zod';
import { EVENT_STATUSES } from './event.types.ts';

export const createEventSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().max(2000).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(2000).optional().nullable(),
    scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
    status: z.enum(EVENT_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update must be provided',
  });

export const eventPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(EVENT_STATUSES).optional(),
});

export const eventIdParamSchema = z.object({
  id: z.string().uuid('Invalid event ID format'),
});
