import { z } from 'zod';

export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  traceId: z.string(),
  timestamp: z.string().datetime(),
  version: z.literal('1.0'),
});

export const ParticipantRegisteredEvent = BaseEventSchema.extend({
  type: z.literal('PARTICIPANT_REGISTERED'),
  payload: z.object({
    participantId: z.string().uuid(),
    userId: z.string().uuid(),
    roundId: z.string().uuid().optional(),
    eventId: z.string().uuid(),
  }),
});

export const DrawCreatedEvent = BaseEventSchema.extend({
  type: z.literal('DRAW_CREATED'),
  payload: z.object({
    roundId: z.string().uuid(),
    drawId: z.string().uuid(),
    sequenceNumber: z.number().int().positive(),
    questionId: z.string().uuid(),
    keyId: z.string().uuid(),
    drawnAt: z.string().datetime(),
  }),
});

export const ClaimAttemptRecordedEvent = BaseEventSchema.extend({
  type: z.literal('CLAIM_ATTEMPT_RECORDED'),
  payload: z.object({
    attemptId: z.string().uuid(),
    roundId: z.string().uuid(),
    participantId: z.string().uuid(),
    ticketId: z.string().uuid(),
    patternType: z.string(),
    attemptNumber: z.number().int().min(1).max(3),
    attemptsRemaining: z.number().int().min(0).max(2),
    status: z.enum(['INELIGIBLE', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED']),
    rejectionReason: z.string().nullable().optional(),
  }),
});

export const WinnerVerifiedEvent = BaseEventSchema.extend({
  type: z.literal('WINNER_VERIFIED'),
  payload: z.object({
    winnerId: z.string().uuid(),
    roundId: z.string().uuid(),
    claimId: z.string().uuid(),
    participantId: z.string().uuid(),
    patternType: z.string(),
    sequenceNumber: z.number().int().positive(),
    verifiedAt: z.string().datetime(),
  }),
});

export const RoundStateChangedEvent = BaseEventSchema.extend({
  type: z.literal('ROUND_STATE_CHANGED'),
  payload: z.object({
    roundId: z.string().uuid(),
    eventId: z.string().uuid(),
    previousStatus: z.string(),
    newStatus: z.string(),
    changedAt: z.string().datetime(),
  }),
});

export type TombolaEvent =
  | z.infer<typeof ParticipantRegisteredEvent>
  | z.infer<typeof DrawCreatedEvent>
  | z.infer<typeof ClaimAttemptRecordedEvent>
  | z.infer<typeof WinnerVerifiedEvent>
  | z.infer<typeof RoundStateChangedEvent>;

export const KAFKA_TOPICS = {
  PARTICIPANTS: 'tombola.participants',
  DRAWS: 'tombola.draws',
  CLAIMS: 'tombola.claims',
  GAME_STATE: 'tombola.game.state',
  DEAD_LETTER: 'tombola.dead-letter',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
