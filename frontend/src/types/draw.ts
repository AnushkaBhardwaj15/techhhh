import { z } from 'zod';
import { eligibleCellIdsSchema } from './winners';

const timestamp = z.string().datetime({ offset: true });
const uuid = z.string().uuid();

export const participantDrawSchema = z.object({
  id: uuid,
  roundId: uuid,
  sequenceNumber: z.number().int().positive(),
  drawMode: z.enum(['RANDOM', 'MANUAL']),
  questionText: z.string().min(1),
  keyValue: z.string().min(1),
  drawnAt: timestamp,
});

export const participantDrawPageSchema = z.object({
  data: z.array(participantDrawSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

const envelope = { eventId: uuid, roundId: uuid, occurredAt: timestamp };
export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('ROUND_STARTED'), payload: z.object({ status: z.literal('ACTIVE') }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal('ROUND_PAUSED'), payload: z.object({ status: z.literal('PAUSED') }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal('ROUND_RESUMED'), payload: z.object({ status: z.literal('ACTIVE') }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal('ROUND_COMPLETED'), payload: z.object({ status: z.literal('COMPLETED') }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal('DRAW_CREATED'), payload: z.object({ sequence: z.number().int().positive(), key: z.string().min(1), question: z.string().min(1), drawnAt: timestamp }).strict() }).strict(),
  z.object({ ...envelope, type: z.literal('WIN_CLAIM_CREATED'), payload: z.object({ claimId: uuid, participantName: z.string().min(1), pattern: z.enum(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']) }).strict() }).strict(),
  z.object({
    ...envelope,
    type: z.literal('WINNER_VERIFIED'),
    payload: z.object({
      winnerId: uuid,
      participantName: z.string().min(1),
      pattern: z.enum(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']),
      // Older backend snapshots omit evidence until G01 reaches the integration branch.
      eligibleCellIds: eligibleCellIdsSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({ ...envelope, type: z.literal('ANNOUNCEMENT'), payload: z.object({ message: z.string().min(1).max(500) }).strict() }).strict(),
]);

export type ParticipantDraw = z.infer<typeof participantDrawSchema>;
export type ParticipantDrawPage = z.infer<typeof participantDrawPageSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
