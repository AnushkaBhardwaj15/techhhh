import { z } from 'zod';

export const winnerPatternSchema = z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']);
const timestamp = z.string().datetime({ offset: true });
export const eligibleCellIdsSchema = z.array(z.string().uuid()).min(5).max(15)
  .refine((cellIds) => new Set(cellIds).size === cellIds.length, 'Eligible cell IDs must be unique');

export const participantWinSchema = z.object({
  id: z.string(), claimId: z.string(), participantId: z.string(), roundId: z.string(), eventId: z.string(),
  patternType: winnerPatternSchema, participantName: z.string().optional(), eventTitle: z.string().optional(), verifiedAt: timestamp,
  eligibleCellIds: eligibleCellIdsSchema.optional(),
});
export const participantWinsPageSchema = z.object({ data: z.array(participantWinSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.number().int().positive() });
export const publicLiveWinnerSchema = z.object({ id: z.string(), roundId: z.string(), pattern: winnerPatternSchema, participantName: z.string(), verifiedAt: timestamp });
const publicWinnersByPatternSchema = z.record(winnerPatternSchema, z.array(publicLiveWinnerSchema));
export const liveWinnersSchema = z.union([
  z.object({ roundId: z.null(), data: z.array(z.never()) }),
  z.object({ roundId: z.string(), data: publicWinnersByPatternSchema }),
]);

export type WinnerPattern = z.infer<typeof winnerPatternSchema>;
export type ParticipantWin = z.infer<typeof participantWinSchema>;
export type ParticipantWinsPage = z.infer<typeof participantWinsPageSchema>;
export type PublicLiveWinner = z.infer<typeof publicLiveWinnerSchema>;
export type LiveWinners = z.infer<typeof liveWinnersSchema>;
