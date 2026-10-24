import { z } from 'zod';

export const submitClaimBodySchema = z.object({
  roundId: z.string().uuid(),
  pattern: z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']),
});

export const listClaimsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const claimIdParamsSchema = z.object({ id: z.string().uuid() });
export const listWinnersQuerySchema = listClaimsQuerySchema;
