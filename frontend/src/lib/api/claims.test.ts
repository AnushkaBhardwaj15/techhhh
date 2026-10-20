import { afterEach, describe, expect, it, vi } from 'vitest';
import { getParticipantClaims, submitParticipantClaim } from './claims';

afterEach(() => vi.unstubAllGlobals());

const claim = { id: 'claim-1', roundId: 'round-1', participantId: 'participant-1', ticketId: 'ticket-1', patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', createdAt: '2026-10-17T14:00:00.000Z' };

describe('participant claims API', () => {
  it('submits the confirmed round and pattern through the shared API client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ claim }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitParticipantClaim('round-1', 'EARLY_5')).resolves.toEqual(claim);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/participant/claims');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ roundId: 'round-1', pattern: 'EARLY_5' });
  });

  it('lists only the requested page and parses server status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [claim], total: 51, page: 2, limit: 25 }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getParticipantClaims(2, 25)).resolves.toMatchObject({ data: [{ status: 'PENDING_VERIFICATION' }], page: 2, total: 51 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/participant/claims?page=2&limit=25');
  });

  it('rejects an unknown claim status instead of inventing its meaning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ claim: { ...claim, status: 'MAYBE_WINNER' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(submitParticipantClaim('round-1', 'EARLY_5')).rejects.toThrow();
  });
});
