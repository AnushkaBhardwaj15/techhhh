import { afterEach, describe, expect, it, vi } from 'vitest';
import { markTicketCell } from './marks';

afterEach(() => vi.unstubAllGlobals());

describe('participant mark API', () => {
  const ticketId = '11111111-1111-4111-8111-111111111111';
  const cellId = '22222222-2222-4222-8222-222222222222';
  const markedAt = '2026-10-17T14:00:00.000Z';

  it('posts a cell ID and parses the server confirmation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ mark: { id: '33333333-3333-4333-8333-333333333333', ticketId, cellId, markedAt } }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(markTicketCell(ticketId, cellId)).resolves.toMatchObject({ ticketId, cellId, markedAt });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/participant/tickets/${ticketId}/marks`);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ cellId });
  });

  it('rejects a confirmation for a different Ticket', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ mark: { id: '33333333-3333-4333-8333-333333333333', ticketId: '55555555-5555-4555-8555-555555555555', cellId, markedAt } }), { headers: { 'content-type': 'application/json' } })));

    await expect(markTicketCell(ticketId, cellId)).rejects.toThrow('Mark response does not match the requested Ticket cell.');
  });

  it('rejects a confirmation for a different Ticket cell', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ mark: { id: '33333333-3333-4333-8333-333333333333', ticketId, cellId: '44444444-4444-4444-8444-444444444444', markedAt } }), { headers: { 'content-type': 'application/json' } })));

    await expect(markTicketCell(ticketId, cellId)).rejects.toThrow('Mark response does not match the requested Ticket cell.');
  });

  it('rejects a malformed mark response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ mark: { ticketId, cellId } }), { headers: { 'content-type': 'application/json' } })));

    await expect(markTicketCell(ticketId, cellId)).rejects.toThrow();
  });
});
