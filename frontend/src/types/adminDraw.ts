import { z } from 'zod';

export const adminDrawSchema = z.object({
  id: z.string().uuid(),
  roundId: z.string().uuid(),
  sequenceNumber: z.number().int().positive(),
  drawMode: z.enum(['RANDOM', 'MANUAL']),
  questionId: z.string().uuid(),
  keyId: z.string().uuid(),
  questionText: z.string().min(1),
  keyValue: z.string().min(1),
  drawnAt: z.string().datetime({ offset: true }),
});

export const adminDrawListSchema = z.object({
  data: z.array(adminDrawSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export const createManualAdminDrawSchema = z.object({ questionId: z.string().uuid() });

export const adminRoundRealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DRAW_CREATED'), eventId: z.string().uuid(), roundId: z.string().uuid(),
    occurredAt: z.string().datetime(),
    payload: z.object({ sequence: z.number().int().positive(), key: z.string().min(1), question: z.string().min(1), drawnAt: z.string().datetime() }).strict(),
  }).strict(),
  z.object({ type: z.enum(['ROUND_STARTED', 'ROUND_PAUSED', 'ROUND_RESUMED', 'ROUND_COMPLETED']), eventId: z.string().uuid(), roundId: z.string().uuid(), occurredAt: z.string().datetime(), payload: z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']) }).strict() }).strict(),
]);

export type AdminDraw = z.infer<typeof adminDrawSchema>;
export type AdminDrawList = z.infer<typeof adminDrawListSchema>;
