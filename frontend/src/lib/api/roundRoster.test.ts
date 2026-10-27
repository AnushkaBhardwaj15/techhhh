import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRoundRoster } from './roundRoster';

const id = 'e9838d65-344c-4b40-b7b3-eb94a2da5793';
afterEach(() => vi.unstubAllGlobals());
describe('round roster API', () => {
  it('requests the protected round endpoint with credentials and parses the server count', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ roundId: id, total: 0, participants: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await getRoundRoster(id)).toEqual({ roundId: id, total: 0, participants: [] });
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/admin/play/rounds/${id}/participants`);
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });

  it.each([
    { roundId: id, total: -1, participants: [] },
    { roundId: 'b4b958e8-ec0d-433a-b44b-630e01fa606a', total: 0, participants: [] },
    { participants: [] },
  ])('rejects malformed or mismatched rosters instead of inventing counts', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } })));
    await expect(getRoundRoster(id)).rejects.toThrow();
  });
});
