import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminParticipant, getAdminParticipant, listAdminParticipants, updateAdminParticipant } from './adminParticipants';

const participant = {
  id: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69', userId: '8d632d5f-16b1-4292-99e5-0d3628914c2c', eventId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52',
  email: 'person@example.test', name: 'Sam', externalId: null, status: 'ACTIVE', emailDeliveryStatus: 'SENT',
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z',
};
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());

describe('admin Participants API', () => {
  it('lists the server dataset using Event, search, status, and pagination filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [participant], pagination: { page: 2, limit: 20, total: 22, totalPages: 2 } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await listAdminParticipants({ eventId: participant.eventId, page: 2, search: 'Sam', status: 'ACTIVE' });
    expect(result.pagination.total).toBe(22);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/participants?eventId=${participant.eventId}&page=2&limit=20&search=Sam&status=ACTIVE`);
  });

  it('gets a Participant through the documented detail route', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response({ participant })); vi.stubGlobal('fetch', fetchMock);
    await getAdminParticipant(participant.id, participant.eventId);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/participants/${participant.id}`);
  });

  it('creates a Participant through the documented route', async () => {
    const fetchMock = vi.fn().mockImplementation(() => response({ participant })); vi.stubGlobal('fetch', fetchMock);
    await createAdminParticipant({ eventId: participant.eventId, email: participant.email, name: participant.name, password: 'FixturePass123!' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/participants');
  });

  it('updates an allowed status field through PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ participant })); vi.stubGlobal('fetch', fetchMock);
    await updateAdminParticipant(participant.id, { status: 'INACTIVE' });
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({ status: 'INACTIVE' });
  });

  it('rejects attempts to reassign a Participant to another Event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ participant })));
    await expect(updateAdminParticipant(participant.id, { eventId: participant.eventId } as never)).rejects.toThrow();
  });

  it('rejects attempts to change a Participant email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ participant })));
    await expect(updateAdminParticipant(participant.id, { email: 'other@example.test' } as never)).rejects.toThrow();
  });

  it('rejects malformed server response records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ participant: { ...participant, status: 'UNKNOWN' } })));
    await expect(getAdminParticipant(participant.id, participant.eventId)).rejects.toThrow();
  });

  it('rejects a detail response from a different Event before it can enter the query cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ participant: { ...participant, eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4' } })));
    await expect(getAdminParticipant(participant.id, participant.eventId)).rejects.toThrow('does not belong to the selected Event');
  });
});
