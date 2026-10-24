import { z } from 'zod';

export const claimPatternSchema = z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']);
export const participantClaimSchema = z.object({
  id: z.string(), roundId: z.string(), participantId: z.string(), ticketId: z.string(),
  patternType: claimPatternSchema,
  status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REJECTED_PATTERN_ALREADY_CLOSED']),
  createdAt: z.string().datetime({ offset: true }),
});
export const participantClaimsPageSchema = z.object({ data: z.array(participantClaimSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() });

export type ClaimPattern = z.infer<typeof claimPatternSchema>;
export type ParticipantClaim = z.infer<typeof participantClaimSchema>;
export type ParticipantClaimsPage = z.infer<typeof participantClaimsPageSchema>;
