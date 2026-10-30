import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAdminWinners } from './adminWinners';

const winner = {
  id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', claimId: '76ab2634-5973-4bbb-b28d-6c19bcf953a1',
  participantId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52',
  eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', patternType: 'EARLY_5', participantName: 'Sam Rivera',
  eventTitle: 'Tech Tambola', verifiedAt: '2026-10-17T10:05:00.000Z',
};

function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());

describe('admin Winners API', () => {
  it('loads the documented server-paginated Winner DTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [winner], total: 61, page: 2, limit: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listAdminWinners({ page: 2, limit: 20 })).resolves.toMatchObject({ total: 61, page: 2, data: [{ id: winner.id, participantName: 'Sam Rivera' }] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/winners?page=2&limit=20');
  });

  it('uses the first server page by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [winner], total: 1, page: 1, limit: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    await listAdminWinners();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/winners?page=1&limit=20');
  });

  it('rejects a list row missing server-provided Participant or Event labels', async () => {
    const incomplete: Record<string, unknown> = { ...winner };
    delete incomplete.participantName;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: [incomplete], total: 1, page: 1, limit: 20 })));
    await expect(listAdminWinners()).rejects.toThrow();
  });
});
