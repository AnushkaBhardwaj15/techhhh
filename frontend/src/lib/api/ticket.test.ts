import { afterEach, describe, expect, it, vi } from 'vitest';
import { getParticipantTicket } from './ticket';

afterEach(() => vi.unstubAllGlobals());

describe('participant ticket API', () => {
  it('requests the selected round and parses the nested server ticket', async () => {
    const cells = Array.from({ length: 15 }, (_, index) => ({
      id: `c${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 5,
      row: Math.floor(index / 5), column: index % 5, keyId: `k${index}`, keyValue: index === 0 ? 'A VERY LONG TECHNOLOGY KEY' : `KEY ${index}`, marked: index === 0,
    }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { id: 't1', roundId: 'r1', participantId: 'p1', eventId: 'e1', createdAt: '2026-10-17T14:00:00.000Z', cells } }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const ticket = await getParticipantTicket('r1', 'e1');
    expect(ticket).toMatchObject({ id: 't1', roundId: 'r1' });
    expect(ticket.cells[0]).toMatchObject({ id: 'c0', keyValue: 'A VERY LONG TECHNOLOGY KEY', marked: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/participant/ticket?roundId=r1');
  });

  it.each([
    ['round', 'r2', 'e1'],
    ['event', 'r1', 'e2'],
  ])('rejects a ticket returned for a different %s', async (_scope, roundId, eventId) => {
    const cells = Array.from({ length: 15 }, (_, index) => ({ id: `c${index}`, rowIndex: Math.floor(index / 5), colIndex: index % 5, row: Math.floor(index / 5), column: index % 5, keyId: `k${index}`, keyValue: `KEY ${index}`, marked: false }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: { id: 't1', roundId: 'r1', participantId: 'p1', eventId: 'e1', createdAt: '2026-10-17T14:00:00.000Z', cells } }), { headers: { 'content-type': 'application/json' } })));

    await expect(getParticipantTicket(roundId, eventId)).rejects.toThrow('Ticket response does not match the requested Event and Round.');
  });
});
