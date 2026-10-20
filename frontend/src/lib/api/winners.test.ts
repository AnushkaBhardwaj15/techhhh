import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveWinners, getParticipantWins } from './winners';

afterEach(() => vi.unstubAllGlobals());

const winner = { id: 'winner-1', claimId: 'claim-1', participantId: 'profile-1', roundId: 'round-1', eventId: 'event-1', patternType: 'EARLY_5', verifiedAt: '2026-10-17T14:00:00.000Z', eligibleCellIds: [1, 2, 3, 4, 5].map((n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`) };
const page = { data: [winner], total: 1, page: 1, limit: 50 };

describe('winner API', () => {
  it('parses only the authenticated participant wins and pagination response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getParticipantWins()).resolves.toMatchObject(page);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/participant/wins?page=1&limit=50');
  });

  it('parses the public grouped winner snapshot and empty live state', async () => {
    const groups = Object.fromEntries(['EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE'].map((pattern) => [pattern, pattern === 'EARLY_5' ? [{ id: 'winner-1', roundId: 'round-1', pattern: 'EARLY_5', participantName: 'Ari Patel', verifiedAt: '2026-10-17T14:00:00.000Z' }] : []]));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ roundId: 'round-1', data: groups }), { headers: { 'content-type': 'application/json' } })).mockResolvedValueOnce(new Response(JSON.stringify({ roundId: null, data: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getLiveWinners()).resolves.toMatchObject({ roundId: 'round-1', data: { EARLY_5: [{ participantName: 'Ari Patel' }] } });
    await expect(getLiveWinners()).resolves.toEqual({ roundId: null, data: [] });
  });

  it('rejects public or participant winner payloads missing identity or pattern fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...page, data: [{ ...winner, patternType: 'MAYBE' }] }), { headers: { 'content-type': 'application/json' } })));
    await expect(getParticipantWins()).rejects.toThrow();
  });

  it('treats server-selected cell evidence as optional until the backend contract is deployed', async () => {
    const withoutEvidence = { ...page, data: [{ ...winner }] };
    delete (withoutEvidence.data[0] as Partial<typeof winner>).eligibleCellIds;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(withoutEvidence), { headers: { 'content-type': 'application/json' } })));
    const result = await getParticipantWins();
    expect(result.data[0]?.eligibleCellIds).toBeUndefined();
  });
});
