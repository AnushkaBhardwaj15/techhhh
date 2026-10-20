import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveDraws, getLiveEvent, getLiveRound } from './liveDisplay';

afterEach(() => vi.unstubAllGlobals());
function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('public Live Display API', () => {
  it('loads nullable Event and Round DTOs from public reads', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ event: null })).mockResolvedValueOnce(response({ round: null }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getLiveEvent()).resolves.toBeNull();
    await expect(getLiveRound()).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/live/event', '/api/v1/live/round']);
  });

  it('loads the public current-Round Draw envelope and rejects mismatched scope', async () => {
    const roundId = '22222222-2222-4222-8222-222222222222';
    const draw = { id: '33333333-3333-4333-8333-333333333333', roundId, sequenceNumber: 1, drawMode: 'MANUAL', question: 'Which tool?', key: 'DOCKER', drawnAt: '2026-10-18T10:00:00.000Z' };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ roundId, data: [draw] })).mockResolvedValueOnce(response({ roundId, data: [{ ...draw, roundId: '11111111-1111-4111-8111-111111111111' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getLiveDraws()).resolves.toMatchObject({ roundId, data: [draw] });
    await expect(getLiveDraws()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
