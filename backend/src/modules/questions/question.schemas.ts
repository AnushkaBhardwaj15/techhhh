import { z } from 'zod';

export const createKeySchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  value: z.string().trim().min(2).max(50),
});

export const updateKeySchema = z.object({
  value: z.string().trim().min(2).max(50),
});

export const keyPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventId: z.string().uuid('Invalid event ID format').optional(),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  used: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
});

export const keyIdParamSchema = z.object({
  id: z.string().uuid('Invalid key ID format'),
});

export const createQuestionSchema = z.object({
  roundId: z.string().uuid('Invalid round ID format'),
  keyId: z.string().uuid('Invalid key ID format'),
  questionText: z.string().trim().min(10, 'Question must be at least 10 characters').max(500),
});

export const updateQuestionSchema = z.object({
  questionText: z.string().trim().min(10, 'Question must be at least 10 characters').max(500),
});

export const questionPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  roundId: z.string().uuid('Invalid round ID format').optional(),
  search: z.string().trim().max(100).optional().transform((value) => value || undefined),
  used: z.enum(['true', 'false']).optional().transform((value) => value === undefined ? undefined : value === 'true'),
});

export const questionIdParamSchema = z.object({
  id: z.string().uuid('Invalid question ID format'),
});
