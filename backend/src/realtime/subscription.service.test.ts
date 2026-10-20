import { describe, expect, it } from 'bun:test';
import { RealtimeSubscriptionService } from './subscription.service.ts';
import type { EventRepository } from '../modules/events/event.repository.ts';
import type { RoundRepository } from '../modules/rounds/round.repository.ts';
import type { EventSummary } from '../modules/events/event.types.ts';
import type { RoundSummary } from '../modules/rounds/round.types.ts';

const eventId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const timestamp = new Date('2026-10-15T12:00:00.000Z');
const event: EventSummary = { id: eventId, title: 'Tech Tombola', description: null, status: 'LIVE', scheduledAt: null, startedAt: timestamp, completedAt: null, createdAt: timestamp, updatedAt: timestamp };
const round: RoundSummary = { id: roundId, eventId, sequenceNumber: 1, name: 'Round 1', status: 'ACTIVE', patterns: [], createdAt: timestamp, updatedAt: timestamp };

function service() {
  const eventRepo: Pick<EventRepository, 'findById'> = { findById: async (id) => id === eventId ? event : null };
  const roundRepo: Pick<RoundRepository, 'findById'> = { findById: async (id) => id === roundId ? round : null };
  return new RealtimeSubscriptionService(eventRepo, roundRepo);
}

describe('RealtimeSubscriptionService', () => {
  it('derives a Participant Event scope from the authenticated principal', async () => {
    await expect(service().resolveAuthenticated(
      { id: 'user', email: 'participant@example.test', name: 'Asha', role: 'PARTICIPANT', status: 'ACTIVE', eventId }, { roundId }
    )).resolves.toEqual({ eventId, roundId, audience: 'AUTHENTICATED' });
  });

  it('rejects a Participant subscription for another Event', async () => {
    await expect(service().resolveAuthenticated(
      { id: 'user', email: 'participant@example.test', name: 'Asha', role: 'PARTICIPANT', status: 'ACTIVE', eventId },
      { eventId: '44444444-4444-4444-8444-444444444444', roundId }
    )).rejects.toThrow('Participants may only subscribe to their assigned Event');
  });

  it('requires administrators to select a valid Event and Round scope', async () => {
    const admin = { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'ADMIN', status: 'ACTIVE' };
    await expect(service().resolveAuthenticated(admin, { roundId })).rejects.toThrow('eventId is required');
    await expect(service().resolveAuthenticated(admin, { eventId, roundId })).resolves.toEqual({ eventId, roundId, audience: 'ADMIN' });
  });

  it('rejects a user without a Participant or Administrator role', async () => {
    await expect(service().resolveAuthenticated({ id: 'user', email: 'user@example.test', name: 'User', role: null, status: 'ACTIVE' }, { eventId, roundId })).rejects.toThrow('Only Participants and Administrators');
  });

  it('rejects missing and mismatched Round scopes for public subscribers', async () => {
    await expect(service().resolvePublic({ eventId })).rejects.toThrow();
    await expect(service().resolvePublic({ eventId, roundId: '44444444-4444-4444-8444-444444444444' })).rejects.toThrow('Round not found in Event');
  });

  it('allows public Live Display subscriptions for each selected Round lifecycle state', async () => {
    const eventRepo: Pick<EventRepository, 'findById'> = { findById: async () => event };
    for (const status of ['READY', 'ACTIVE', 'PAUSED', 'RECOVERY_REQUIRED', 'COMPLETED'] as const) {
      const currentRound: RoundSummary = { ...round, status };
      const roundRepo: Pick<RoundRepository, 'findById'> = { findById: async () => currentRound };
      const realtime = new RealtimeSubscriptionService(eventRepo, roundRepo);
      await expect(realtime.resolvePublic({ eventId, roundId })).resolves.toEqual({ eventId, roundId });
    }
  });

  it('keeps authenticated subscriptions limited to ACTIVE or PAUSED Rounds', async () => {
    const eventRepo: Pick<EventRepository, 'findById'> = { findById: async () => event };
    const completedRound: RoundSummary = { ...round, status: 'COMPLETED' };
    const roundRepo: Pick<RoundRepository, 'findById'> = { findById: async () => completedRound };
    const realtime = new RealtimeSubscriptionService(eventRepo, roundRepo);
    await expect(realtime.resolveAuthenticated(
      { id: 'user', email: 'participant@example.test', name: 'Asha', role: 'PARTICIPANT', status: 'ACTIVE', eventId }, { roundId }
    )).rejects.toThrow('eligible Round');
  });});
