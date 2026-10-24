import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
export const participantEventSchema = z.object({
  id: z.string(), title: z.string(), description: z.string().nullable(), status: z.enum(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
  scheduledAt: timestamp.nullable(), startedAt: timestamp.nullable(), completedAt: timestamp.nullable(), createdAt: timestamp, updatedAt: timestamp,
});
const patternSchema = z.object({
  id: z.string(), roundId: z.string(), patternType: z.enum(['EARLY_5', 'FOUR_CORNERS', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE', 'SECOND_FULL_HOUSE']),
  enabled: z.boolean(), maxWinners: z.number(), status: z.enum(['OPEN', 'CLOSED']), createdAt: timestamp, updatedAt: timestamp,
});
export const participantRoundSchema = z.object({
  id: z.string(), eventId: z.string(), sequenceNumber: z.number(), name: z.string(),
  status: z.enum(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED']),
  patterns: z.array(patternSchema), createdAt: timestamp, updatedAt: timestamp,
});
export type ParticipantEvent = z.infer<typeof participantEventSchema>;
export type ParticipantRound = z.infer<typeof participantRoundSchema>;
