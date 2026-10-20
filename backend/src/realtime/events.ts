import { z } from 'zod';

const envelopeSchema = z.object({
  eventId: z.string().uuid(),
  roundId: z.string().uuid(),
  occurredAt: z.string().datetime(),
}).strict();

export const realtimeEventSchema = z.discriminatedUnion('type', [
  envelopeSchema.extend({
    type: z.literal('ROUND_STARTED'),
    payload: z.object({ status: z.literal('ACTIVE') }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('ROUND_PAUSED'),
    payload: z.object({ status: z.literal('PAUSED') }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('ROUND_RESUMED'),
    payload: z.object({ status: z.literal('ACTIVE') }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('ROUND_COMPLETED'),
    payload: z.object({ status: z.literal('COMPLETED') }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('DRAW_CREATED'),
    payload: z.object({
      sequence: z.number().int().positive(),
      key: z.string().min(1),
      question: z.string().min(1),
      drawnAt: z.string().datetime(),
    }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('WIN_CLAIM_CREATED'),
    payload: z.object({
      claimId: z.string().uuid(),
      participantName: z.string().min(1),
      pattern: z.enum(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']),
    }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('WINNER_VERIFIED'),
    payload: z.object({
      winnerId: z.string().uuid(),
      participantName: z.string().min(1),
      pattern: z.enum(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE']),
      eligibleCellIds: z.array(z.string().uuid()).min(5).max(15)
        .refine((cellIds) => new Set(cellIds).size === cellIds.length, 'Winning cell IDs must be unique'),
    }).strict(),
  }),
  envelopeSchema.extend({
    type: z.literal('ANNOUNCEMENT'),
    payload: z.object({ message: z.string().min(1).max(500) }).strict(),
  }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['type'];
export type RealtimeAudience = 'AUTHENTICATED' | 'ADMIN' | 'PUBLIC';

export const realtimeEventMetadata: Record<
  RealtimeEventType,
  { readonly audiences: readonly RealtimeAudience[] }
> = {
  ROUND_STARTED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  ROUND_PAUSED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  ROUND_RESUMED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  ROUND_COMPLETED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  DRAW_CREATED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  WIN_CLAIM_CREATED: { audiences: ['ADMIN'] },
  WINNER_VERIFIED: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
  ANNOUNCEMENT: { audiences: ['AUTHENTICATED', 'ADMIN', 'PUBLIC'] },
};

export function eventAudiences(event: RealtimeEvent): readonly RealtimeAudience[] {
  return realtimeEventMetadata[event.type].audiences;
}

export const realtimeReconnectProtocol =
  'On reconnect, fetch authoritative state from the REST APIs and replace any displayed WebSocket state. Events are not replayed.';

export function serializeRealtimeEvent(event: unknown): string {
  return JSON.stringify(realtimeEventSchema.parse(event));
}
