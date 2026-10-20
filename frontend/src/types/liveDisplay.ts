import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const roundStatus = z.enum(['DRAFT', 'READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED', 'CANCELLED']);

export const liveEventSchema = z.object({
  id: z.string().uuid(), title: z.string().min(1), description: z.string().nullable(),
  status: z.enum(['DRAFT', 'READY', 'LIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
  scheduledAt: timestamp.nullable(), startedAt: timestamp.nullable(), completedAt: timestamp.nullable(),
});
export const liveRoundSchema = z.object({
  id: z.string().uuid(), eventId: z.string().uuid(), sequenceNumber: z.number().int().positive(),
  name: z.string().min(1), status: roundStatus, updatedAt: timestamp,
});
export const liveDrawSchema = z.object({
  id: z.string().uuid(), roundId: z.string().uuid(), sequenceNumber: z.number().int().positive(),
  drawMode: z.enum(['RANDOM', 'MANUAL']), question: z.string().min(1), key: z.string().min(1), drawnAt: timestamp,
});
export const liveDrawListSchema = z.union([
  z.object({ roundId: z.null(), data: z.array(z.never()) }),
  z.object({ roundId: z.string().uuid(), data: z.array(liveDrawSchema) }).superRefine((list, context) => {
    if (list.data.some((draw) => draw.roundId !== list.roundId)) context.addIssue({ code: 'custom', path: ['data'], message: 'Live Draws must belong to the current Round' });
  }),
]);

export type LiveEvent = z.infer<typeof liveEventSchema>;
export type LiveRound = z.infer<typeof liveRoundSchema>;
export type LiveDraw = z.infer<typeof liveDrawSchema>;
