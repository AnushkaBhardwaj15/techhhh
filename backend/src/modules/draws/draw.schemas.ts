import { z } from 'zod';

export const roundIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const manualDrawBodySchema = z.object({
  questionId: z.string().uuid(),
});

export const listDrawsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const listParticipantDrawsQuerySchema = z.object({
  roundId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
