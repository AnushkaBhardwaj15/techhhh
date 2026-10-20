import { describe, expect, it } from 'bun:test';
import { eventAudiences, realtimeEventMetadata, realtimeEventSchema, realtimeReconnectProtocol, serializeRealtimeEvent } from './events.ts';

const ids = { eventId: '11111111-1111-4111-8111-111111111111', roundId: '22222222-2222-4222-8222-222222222222', claimId: '33333333-3333-4333-8333-333333333333' };

describe('realtime event schemas', () => {
  it('serializes a revealed Draw with the canonical envelope', () => {
    const serialized = serializeRealtimeEvent({ type: 'DRAW_CREATED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { sequence: 1, key: 'DOCKER', question: 'Which platform packages applications into containers?', drawnAt: '2026-10-15T12:00:00.000Z' } });
    expect(JSON.parse(serialized)).toEqual({ type: 'DRAW_CREATED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { sequence: 1, key: 'DOCKER', question: 'Which platform packages applications into containers?', drawnAt: '2026-10-15T12:00:00.000Z' } });
  });

  it('publishes explicit audience metadata for each event type', () => {
    expect(Object.keys(realtimeEventMetadata)).toHaveLength(8);
    expect(realtimeEventMetadata.DRAW_CREATED.audiences).toEqual(['AUTHENTICATED', 'ADMIN', 'PUBLIC']);
    expect(realtimeEventMetadata.WIN_CLAIM_CREATED.audiences).toEqual(['ADMIN']);
  });

  it('allows claim notifications only for Admin connections', () => {
    const claim = realtimeEventSchema.parse({ type: 'WIN_CLAIM_CREATED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { claimId: ids.claimId, participantName: 'Asha', pattern: 'EARLY_5' } });
    expect(eventAudiences(claim)).toEqual(['ADMIN']);
  });

  it('rejects payloads with private participant data and documents REST recovery after reconnect', () => {
    expect(() => serializeRealtimeEvent({ type: 'WINNER_VERIFIED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { winnerId: ids.claimId, participantName: 'Asha', pattern: 'FULL_HOUSE', email: 'asha@example.test' } })).toThrow();
    expect(() => serializeRealtimeEvent({ type: 'WINNER_VERIFIED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { winnerId: ids.claimId, participantName: 'Asha', pattern: 'EARLY_5' } })).toThrow();
    const winner = realtimeEventSchema.parse({ type: 'WINNER_VERIFIED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { winnerId: ids.claimId, participantName: 'Asha', pattern: 'EARLY_5', eligibleCellIds: ['33333333-3333-4333-8333-333333333331', '33333333-3333-4333-8333-333333333332', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333334', '33333333-3333-4333-8333-333333333335'] } });
    expect(winner).toMatchObject({ type: 'WINNER_VERIFIED', payload: { eligibleCellIds: expect.arrayContaining(['33333333-3333-4333-8333-333333333331']) } });
    expect(realtimeReconnectProtocol).toContain('REST');
  });

  it('rejects future-Key fields from public Draw events', () => {
    expect(() => serializeRealtimeEvent({ type: 'DRAW_CREATED', eventId: ids.eventId, roundId: ids.roundId, occurredAt: '2026-10-15T12:00:00.000Z', payload: { sequence: 1, key: 'DOCKER', question: 'Container platform?', drawnAt: '2026-10-15T12:00:00.000Z', futureKey: 'KUBERNETES' } })).toThrow();
  });
});
