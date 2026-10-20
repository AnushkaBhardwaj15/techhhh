import { afterEach, describe, expect, it, vi } from 'vitest';
import { getParticipantDraws } from './draws';

afterEach(() => vi.unstubAllGlobals());

describe('participant draw API', () => {
  it('requests the current round snapshot and validates the response', async () => {
    const roundId = '33333333-3333-4333-8333-333333333333';
    const response = { data: [{ id: '11111111-1111-4111-8111-111111111111', roundId, sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Which tool packages apps?', keyValue: 'DOCKER', drawnAt: '2026-10-17T14:00:00.000Z' }], total: 1, page: 1, limit: 100 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getParticipantDraws(roundId)).toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/participant/draws?roundId=${roundId}&limit=100`);
  });

  it('rejects a snapshot containing a draw for another round', async () => {
    const roundId = '33333333-3333-4333-8333-333333333333';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: '11111111-1111-4111-8111-111111111111', roundId: '44444444-4444-4444-8444-444444444444', sequenceNumber: 1, drawMode: 'RANDOM', questionText: 'Clue', keyValue: 'DOCKER', drawnAt: '2026-10-17T14:00:00.000Z' }], total: 1, page: 1, limit: 100 }), { headers: { 'content-type': 'application/json' } })));

    await expect(getParticipantDraws(roundId)).rejects.toThrow();
  });
});
