import { z } from 'zod';
import { PATTERN_TYPES, ROUND_STATUSES } from './round.types.ts';

export const patternConfigSchema = z.object({
  patternType: z.enum(PATTERN_TYPES),
  enabled: z.boolean().default(true),
  maxWinners: z.number().int().min(1, 'maxWinners must be at least 1').default(1),
});

export const createRoundSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  sequenceNumber: z.number().int().min(1, 'sequenceNumber must be at least 1'),
  name: z.string().trim().min(1, 'Name is required').max(255),
  patterns: z.array(patternConfigSchema).optional(),
});

export const updateRoundSchema = z
  .object({
    sequenceNumber: z.number().int().min(1, 'sequenceNumber must be at least 1').optional(),
    name: z.string().trim().min(1, 'Name cannot be empty').max(255).optional(),
    patterns: z.array(patternConfigSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field to update must be provided',
  });

export const roundPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventId: z.string().uuid('Invalid event ID format').optional(),
  status: z.enum(ROUND_STATUSES).optional(),
});

export const roundIdParamSchema = z.object({
  id: z.string().uuid('Invalid round ID format'),
});
