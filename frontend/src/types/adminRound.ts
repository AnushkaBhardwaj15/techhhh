import { z } from 'zod';

export const roundStatusSchema = z.enum(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED']);
export const patternTypeSchema = z.enum(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']);
export const patternStatusSchema = z.enum(['OPEN', 'CLOSED']);

export const patternConfigSchema = z.object({
  patternType: patternTypeSchema,
  enabled: z.boolean(),
  maxWinners: z.number().int().min(1),
});

export const roundPatternSchema = patternConfigSchema.extend({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  status: patternStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminRoundSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sequenceNumber: z.number().int().positive(),
  name: z.string(),
  status: roundStatusSchema,
  patterns: z.array(roundPatternSchema),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const adminRoundListSchema = z.object({
  data: z.array(adminRoundSchema),
  pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().positive() }),
});

export const createAdminRoundSchema = z.object({
  eventId: z.string().uuid(),
  sequenceNumber: z.number().int().min(1),
  name: z.string().trim().min(1).max(255),
  patterns: z.array(patternConfigSchema).optional(),
});

export const updateAdminRoundSchema = z.object({
  sequenceNumber: z.number().int().min(1).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  patterns: z.array(patternConfigSchema).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one Round field must be changed' });

export type AdminRound = z.infer<typeof adminRoundSchema>;
export type AdminRoundList = z.infer<typeof adminRoundListSchema>;
export type PatternType = z.infer<typeof patternTypeSchema>;
export type PatternConfig = z.infer<typeof patternConfigSchema>;
export type CreateAdminRound = z.infer<typeof createAdminRoundSchema>;
export type UpdateAdminRound = z.infer<typeof updateAdminRoundSchema>;
