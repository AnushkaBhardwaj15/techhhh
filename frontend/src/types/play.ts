import { z } from "zod";
export const playPatternSchema = z.enum([
  "EARLY_5",
  "FOUR_CORNERS",
  "TOP_LINE",
  "MIDDLE_LINE",
  "BOTTOM_LINE",
  "FULL_HOUSE",
  "SECOND_FULL_HOUSE",
]);
export type PlayPattern = z.infer<typeof playPatternSchema>;
const summary = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z.string(),
  code: z.string().length(6),
  status: z.enum([
    "READY",
    "ACTIVE",
    "PAUSED",
    "COMPLETED",
    "RECOVERY_REQUIRED",
  ]),
  sequenceNumber: z.number().int().positive(),
  createdAt: z.string(),
  isBroadcast: z.boolean().optional(),
});
const cell = z.object({
  id: z.string().uuid(),
  keyId: z.string().uuid(),
  number: z.number().int().min(1).max(90),
  term: z.string(),
  row: z.number().int().min(0).max(2),
  column: z.number().int().min(0).max(8),
  marked: z.boolean(),
});
export const playStateSchema = summary.extend({
  closingSequence: z.number().nullable(),
  score: z.number().nullable(),
  ticket: z
    .object({
      id: z.string().uuid(),
      participantId: z.string().uuid(),
      cells: z.array(cell).length(15),
    })
    .nullable(),
  draws: z.array(
    z.object({
      id: z.string().uuid(),
      sequence: z.number().int().positive(),
      prompt: z.string(),
      category: z.string(),
      codeSnippet: z.string().nullable(),
      revealed: z.boolean(),
      revealBatchId: z.string().uuid().nullable().optional(),
      answer: z.string().nullable(),
      number: z.number().nullable(),
      drawnAt: z.string(),
    }),
  ),
  wins: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      pattern: playPatternSchema,
      points: z.number(),
      createdAt: z.string(),
    }),
  ),
  standings: z.array(z.object({ name: z.string(), points: z.number() })),
  patterns: z.array(
    z.object({
      pattern: playPatternSchema,
      points: z.number(),
      closed: z.boolean(),
    }),
  ),
  bank: z
    .array(
      z.object({
        id: z.string().uuid(),
        keyId: z.string().uuid(),
        number: z.number(),
        term: z.string(),
        clue: z.string(),
        category: z.string(),
        codeSnippet: z.string().nullable(),
      }),
    )
    .optional(),
});
export const playListSchema = z.object({ games: z.array(summary) });
export const playCurrentSchema = z.object({
  game: playStateSchema.nullable(),
  games: z.array(summary),
});
export const playClaimSchema = z.object({
  accepted: z.boolean(),
  warning: z.string().optional(),
  points: z.number().optional(),
  game: playStateSchema,
});
export type PlayState = z.infer<typeof playStateSchema>;
export type PlaySummary = z.infer<typeof summary>;
