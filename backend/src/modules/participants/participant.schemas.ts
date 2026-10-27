import { z } from 'zod';

export const createParticipantSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format').optional(),
  password: z.string().min(8).max(128),
  email: z.string().trim().email('Invalid email address format').max(255),
  name: z.string().trim().min(1).max(255).optional(),
  externalId: z.string().trim().min(1).max(255).optional().nullable(),
});

export const updateParticipantSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    externalId: z.string().trim().min(1).max(255).optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update must be provided',
  });

export const participantPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventId: z.string().uuid('Invalid event ID format').optional(),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const participantIdParamSchema = z.object({
  id: z.string().uuid('Invalid participant ID format'),
});
