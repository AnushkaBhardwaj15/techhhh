import { describe, expect, it } from 'bun:test';
import { serializeLiveDraw, serializeLiveEvent, serializeLiveRound, serializeLiveWinner } from './live.domain.ts';
import type { ILiveReadRepository } from './live.repository.ts';
import { LiveReadService } from './live.service.ts';

const event = { id: 'event-public', title: 'Tech Tambola', description: 'Display description', status: 'LIVE' as const, scheduledAt: null, startedAt: new Date('2026-01-01T00:00:00.000Z'), completedAt: null };
const round = { id: 'round-public', eventId: event.id, sequenceNumber: 1, name: 'Round 1', status: 'ACTIVE' as const, updatedAt: new Date('2026-01-01T00:01:00.000Z') };
const draws = [
  { id: 'draw-1', roundId: round.id, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'First clue', keyValue: 'DOCKER', drawnAt: new Date('2026-01-01T00:02:00.000Z') },
  { id: 'draw-2', roundId: round.id, sequenceNumber: 2, drawMode: 'MANUAL', questionText: 'Second clue', keyValue: 'BUN', drawnAt: new Date('2026-01-01T00:03:00.000Z') },
];
const winners = [
  { id: 'winner-1', roundId: round.id, patternType: 'EARLY_5' as const, participantName: 'Asha', verifiedAt: new Date('2026-01-01T00:04:00.000Z') },
  { id: 'winner-2', roundId: round.id, patternType: 'FULL_HOUSE' as const, participantName: 'Dev', verifiedAt: new Date('2026-01-01T00:05:00.000Z') },
];

function repository(overrides: Partial<ILiveReadRepository> = {}): ILiveReadRepository {
  return {
    findCurrentEvent: async () => event,
    findCurrentRound: async () => round,
    listDraws: async () => draws,
    listVerifiedWinners: async () => winners,
    ...overrides,
  };
}

describe('LiveReadService', () => {
  it('returns nullable empty state without a current Event', async () => {
    const service = new LiveReadService(repository({ findCurrentEvent: async () => null }));
    expect(await service.event()).toEqual({ event: null });
    expect(await service.round()).toEqual({ round: null });
    expect(await service.draws()).toEqual({ roundId: null, data: [] });
    expect(await service.winners()).toEqual({ roundId: null, data: [] });
  });

  it('returns public Event and Round DTOs', async () => {
    const service = new LiveReadService(repository());
    expect(await service.event()).toEqual({ event: {
      id: 'event-public', title: 'Tech Tambola', description: 'Display description', status: 'LIVE',
      scheduledAt: null, startedAt: '2026-01-01T00:00:00.000Z', completedAt: null,
    } });
    expect(await service.round()).toEqual({ round: {
      id: 'round-public', eventId: 'event-public', sequenceNumber: 1, name: 'Round 1', status: 'ACTIVE',
      updatedAt: '2026-01-01T00:01:00.000Z',
    } });
  });

  it('returns chronological public Draw DTOs for the current Event and Round', async () => {
    const calls: string[] = [];
    const service = new LiveReadService(repository({ listDraws: async (eventId, roundId) => { calls.push(`${eventId}:${roundId}`); return draws; } }));
    expect(await service.draws()).toEqual({ roundId: round.id, data: [
      { id: 'draw-1', roundId: 'round-public', sequenceNumber: 1, drawMode: 'RANDOM', question: 'First clue', key: 'DOCKER', drawnAt: '2026-01-01T00:02:00.000Z' },
      { id: 'draw-2', roundId: 'round-public', sequenceNumber: 2, drawMode: 'MANUAL', question: 'Second clue', key: 'BUN', drawnAt: '2026-01-01T00:03:00.000Z' },
    ] });
    expect(calls).toEqual(['event-public:round-public']);
  });

  it('groups verified Winners by Pattern with empty pattern groups', async () => {
    const service = new LiveReadService(repository());
    const response = await service.winners();
    expect(response.roundId).toBe(round.id);
    expect(response.data).toEqual({
      EARLY_5: [{ id: 'winner-1', roundId: 'round-public', pattern: 'EARLY_5', participantName: 'Asha', verifiedAt: '2026-01-01T00:04:00.000Z' }],
      FOUR_CORNERS: [], SECOND_FULL_HOUSE: [], TOP_LINE: [],
      MIDDLE_LINE: [],
      BOTTOM_LINE: [],
      FULL_HOUSE: [{ id: 'winner-2', roundId: 'round-public', pattern: 'FULL_HOUSE', participantName: 'Dev', verifiedAt: '2026-01-01T00:05:00.000Z' }],
    });
  });

  it('returns empty Draws and Winners when the current Event has no current Round', async () => {
    const service = new LiveReadService(repository({ findCurrentRound: async () => null }));
    expect(await service.draws()).toEqual({ roundId: null, data: [] });
    expect(await service.winners()).toEqual({ roundId: null, data: [] });
  });
});

describe('public Live serializers', () => {
  it('allows only public Event fields', () => {
    const result = serializeLiveEvent({ ...event, internalAuditMetadata: 'secret', ownerEmail: 'hidden@example.com' } as typeof event);
    expect(result).toEqual({ id: 'event-public', title: 'Tech Tambola', description: 'Display description', status: 'LIVE', scheduledAt: null, startedAt: '2026-01-01T00:00:00.000Z', completedAt: null });
  });

  it('allows only public Round fields', () => {
    const result = serializeLiveRound({ ...round, privateNotes: 'secret' } as typeof round);
    expect(result).toEqual({ id: 'round-public', eventId: 'event-public', sequenceNumber: 1, name: 'Round 1', status: 'ACTIVE', updatedAt: '2026-01-01T00:01:00.000Z' });
  });

  it('excludes future identifiers and internal Draw fields', () => {
    const result = serializeLiveDraw({ ...draws[0], keyId: 'future-key', questionId: 'future-question', drawnBy: 'admin-id' } as typeof draws[0]);
    expect(result).toEqual({ id: 'draw-1', roundId: 'round-public', sequenceNumber: 1, drawMode: 'RANDOM', question: 'First clue', key: 'DOCKER', drawnAt: '2026-01-01T00:02:00.000Z' });
  });

  it('excludes participant identity and verification metadata from Winners', () => {
    const result = serializeLiveWinner({ ...winners[0], participantId: 'private-id', verifiedBy: 'admin-id', claimId: 'private-claim' } as unknown as typeof winners[0]);
    expect(result).toEqual({ id: 'winner-1', roundId: 'round-public', pattern: 'EARLY_5', participantName: 'Asha', verifiedAt: '2026-01-01T00:04:00.000Z' });
  });
});
