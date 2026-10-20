import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { cancelAdminRound, completeAdminRound, createAdminRound, generateAdminRoundTickets, getAdminRound, getAdminRoundTicketCount, listAdminRounds, pauseAdminRound, readyAdminRound, resumeAdminRound, startAdminRound, updateAdminRound } from './adminRounds';

const roundId = '0d3aa3e6-4c58-4c36-b363-d5f11640ba52';
const round = { id: roundId, eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', sequenceNumber: 1, name: 'Opening round', status: 'READY', patterns: [], createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('admin Round operations API', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lists Rounds within the selected Event scope and passes request cancellation', async () => {
    const eventId = round.eventId;
    const fetchMock = mockFetch({ data: [round], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } });
    const controller = new AbortController();
    await listAdminRounds({ eventId, page: 2, signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/admin/rounds?eventId=${eventId}&page=2&limit=20`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('uses the existing Round detail, create, and update contracts', async () => {
    const fetchMock = mockFetch({ round });
    await getAdminRound(roundId);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/admin/rounds/${roundId}`, expect.objectContaining({ credentials: 'include' }));
    await createAdminRound({ eventId: round.eventId, sequenceNumber: 1, name: 'Opening round' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/admin/rounds', expect.objectContaining({ method: 'POST', body: JSON.stringify({ eventId: round.eventId, sequenceNumber: 1, name: 'Opening round' }) }));
    await updateAdminRound(roundId, { name: 'Updated round' });
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/admin/rounds/${roundId}`, expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Updated round' }) }));
  });

  it('rejects a malformed persisted Round record', async () => {
    mockFetch({ round: { ...round, status: 'UNKNOWN' } });
    await expect(getAdminRound(roundId)).rejects.toThrow();
  });

  it.each([
    ['ready', readyAdminRound, 'ready', false],
    ['start', startAdminRound, 'start', true],
    ['pause', pauseAdminRound, 'pause', false],
    ['resume', resumeAdminRound, 'resume', true],
    ['complete', completeAdminRound, 'complete', false],
    ['cancel', cancelAdminRound, 'cancel', false],
  ] as const)('calls the backend %s transition and validates its authoritative Round response', async (_name, command, path, needsKey) => {
    const fetchMock = mockFetch({ round });
    const result = needsKey ? await command(roundId, 'same-logical-command') : await command(roundId);
    expect(result).toEqual(round);
    const [, options] = fetchMock.mock.calls[0]!;
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/admin/rounds/${roundId}/${path}`, expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(needsKey ? 'same-logical-command' : null);
  });

  it('sends ticket generation with an idempotency key and validates its server-selected allocation report', async () => {
    const report = { roundId, totalParticipants: 12, created: 10, existing: 1, skipped: 1 };
    const fetchMock = mockFetch(report);
    expect(await generateAdminRoundTickets(roundId, 'generation-attempt')).toEqual(report);
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/admin/rounds/${roundId}/tickets/generate`, expect.objectContaining({ method: 'POST' }));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe('generation-attempt');
  });

  it('reads only the total from the backend ticket list for allocation display', async () => {
    mockFetch({ data: [], total: 18 });
    await expect(getAdminRoundTicketCount(roundId)).resolves.toBe(18);
  });

  it('rejects malformed server operation responses', async () => {
    mockFetch({ round: { id: roundId } });
    await expect(readyAdminRound(roundId)).rejects.toThrow();
  });

  it('preserves backend errors for readiness blockers and conflicting transitions', async () => {
    mockFetch({ error: { message: 'Round requires at least 15 eligible keys', code: 'ROUND_NOT_READY' } }, 409);
    await expect(readyAdminRound(roundId)).rejects.toMatchObject({ status: 409, code: 'ROUND_NOT_READY' } satisfies Partial<ApiError>);
  });
});
