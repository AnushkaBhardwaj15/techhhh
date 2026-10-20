import { describe, expect, it } from 'vitest';
import { participantDrawPageSchema, realtimeEventSchema } from './draw';

const ids = { draw: '11111111-1111-4111-8111-111111111111', event: '22222222-2222-4222-8222-222222222222', round: '33333333-3333-4333-8333-333333333333' };
const drawnAt = '2026-10-17T14:00:00.000Z';

describe('participant draw contracts', () => {
  it('parses chronological participant snapshots without internal key IDs', () => {
    const page = participantDrawPageSchema.parse({ data: [{ id: ids.draw, roundId: ids.round, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Clue', keyValue: 'DOCKER', drawnAt }], total: 1, page: 1, limit: 100 });
    expect(page.data[0]).toMatchObject({ sequenceNumber: 1, questionText: 'Clue', keyValue: 'DOCKER' });
    expect(page.data[0]).not.toHaveProperty('keyId');
  });

  it('rejects invalid draw snapshots', () => {
    expect(participantDrawPageSchema.safeParse({ data: [{ id: ids.draw, roundId: ids.round, sequenceNumber: 0, drawMode: 'RANDOM', questionText: '', keyValue: 'K', drawnAt }], total: 1, page: 1, limit: 100 }).success).toBe(false);
  });

  it('validates DRAW_CREATED fields and envelope scope', () => {
    expect(realtimeEventSchema.parse({ type: 'DRAW_CREATED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { sequence: 3, key: 'DOCKER', question: 'Clue', drawnAt } })).toMatchObject({ type: 'DRAW_CREATED', payload: { sequence: 3 } });
    expect(realtimeEventSchema.safeParse({ type: 'DRAW_CREATED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { sequence: 0, key: 'DOCKER', question: 'Clue', drawnAt } }).success).toBe(false);
  });

  it('validates lifecycle events and rejects unknown event types', () => {
    expect(realtimeEventSchema.parse({ type: 'ROUND_PAUSED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { status: 'PAUSED' } }).type).toBe('ROUND_PAUSED');
    expect(realtimeEventSchema.safeParse({ type: 'NEW_EVENT', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: {} }).success).toBe(false);
  });

  it('accepts backend-selected eligible cells in Winner events and tolerates older events without evidence', () => {
    const payload = { winnerId: ids.draw, participantName: 'Ari Patel', pattern: 'EARLY_5' as const };
    const cellIds = [1, 2, 3, 4, 5].map((n) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`);
    expect(realtimeEventSchema.parse({ type: 'WINNER_VERIFIED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { ...payload, eligibleCellIds: cellIds } })).toMatchObject({ type: 'WINNER_VERIFIED', payload: { eligibleCellIds: cellIds } });
    expect(realtimeEventSchema.parse({ type: 'WINNER_VERIFIED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload })).toMatchObject({ type: 'WINNER_VERIFIED', payload });
    expect(realtimeEventSchema.safeParse({ type: 'WINNER_VERIFIED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { ...payload, eligibleCellIds: [''] } }).success).toBe(false);
    expect(realtimeEventSchema.safeParse({ type: 'WINNER_VERIFIED', eventId: ids.event, roundId: ids.round, occurredAt: drawnAt, payload: { ...payload, eligibleCellIds: [cellIds[0], cellIds[0], ...cellIds.slice(2)] } }).success).toBe(false);
  });
});
