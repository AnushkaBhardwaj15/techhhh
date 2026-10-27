import { z } from 'zod';

export const submitClaimBodySchema = z.object({
  roundId: z.string().uuid(),
  pattern: z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']),
});

export const listClaimsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const claimIdParamsSchema = z.object({ id: z.string().uuid() });
export const listWinnersQuerySchema = listClaimsQuerySchema;

export const rejectClaimBodySchema = z.object({
  reason: z.enum([
    'ALREADY_CLAIMED',
    'INVALID_MARKS',
    'FALSE_CLAIM',
    'DISQUALIFIED',
    'ADMIN_REJECTED'
  ]).optional().default('ADMIN_REJECTED'),
}).optional();
