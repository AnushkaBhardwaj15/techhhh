import { describe, expect, it } from 'vitest';
import { liveDrawListSchema, liveEventSchema, liveRoundSchema } from './liveDisplay';

const timestamp = '2026-10-18T10:00:00.000Z';
const event = { id: '11111111-1111-4111-8111-111111111111', title: 'Tech Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: timestamp, completedAt: null };
const roundId = '22222222-2222-4222-8222-222222222222';
const draw = { id: '33333333-3333-4333-8333-333333333333', roundId, sequenceNumber: 1, drawMode: 'RANDOM', question: 'Which tool?', key: 'DOCKER', drawnAt: timestamp };

describe('Live Display schemas', () => {
  it('accepts nullable Event and Round reads', () => {
    expect(liveEventSchema.parse(event).title).toBe('Tech Tombola');
    expect(liveRoundSchema.parse({ id: roundId, eventId: event.id, sequenceNumber: 1, name: 'Opening', status: 'ACTIVE', updatedAt: timestamp }).status).toBe('ACTIVE');
  });

  it('accepts explicit no-current-Round Draw state and rejects out-of-scope Draws', () => {
    expect(liveDrawListSchema.parse({ roundId: null, data: [] })).toEqual({ roundId: null, data: [] });
    expect(liveDrawListSchema.parse({ roundId, data: [draw] })).toMatchObject({ roundId, data: [draw] });
    expect(liveDrawListSchema.safeParse({ roundId, data: [{ ...draw, roundId: event.id }] }).success).toBe(false);
  });
});
