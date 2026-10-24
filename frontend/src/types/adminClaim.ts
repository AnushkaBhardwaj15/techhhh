import { z } from 'zod';

export const adminClaimStatusSchema = z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REJECTED_PATTERN_ALREADY_CLOSED']);
export const adminClaimPatternSchema = z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']);

export const adminClaimSchema = z.object({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  participantId: z.string().uuid(),
  participantName: z.string().min(1),
  ticketId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventTitle: z.string().min(1),
  patternType: adminClaimPatternSchema,
  status: adminClaimStatusSchema,
  rejectionReason: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  verifiedAt: z.string().datetime({ offset: true }).nullable(),
});

export const adminClaimListSchema = z.object({
  data: z.array(adminClaimSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export const adminWinnerSchema = z.object({
  id: z.string().uuid(),
  claimId: z.string().uuid(),
  participantId: z.string().uuid(),
  roundId: z.string().uuid(),
  eventId: z.string().uuid(),
  patternType: adminClaimPatternSchema,
  participantName: z.string().optional(),
  eventTitle: z.string().optional(),
  verifiedAt: z.string().datetime({ offset: true }),
});

export const adminWinnerListRowSchema = adminWinnerSchema.extend({
  participantName: z.string().min(1),
  eventTitle: z.string().min(1),
});

export const adminWinnerListSchema = z.object({
  data: z.array(adminWinnerListRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export const verifyAdminClaimResponseSchema = z.object({ winner: adminWinnerSchema });
export const rejectAdminClaimResponseSchema = z.object({
  claim: z.object({ id: z.string().uuid(), status: z.literal('REJECTED'), rejectionReason: z.string().min(1) }),
});

export type AdminClaim = z.infer<typeof adminClaimSchema>;
export type AdminClaimList = z.infer<typeof adminClaimListSchema>;
export type AdminWinner = z.infer<typeof adminWinnerListRowSchema>;
