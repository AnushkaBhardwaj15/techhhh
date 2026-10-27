import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAdminClaims, rejectAdminClaim, verifyAdminClaim } from './adminClaims';

const claim = {
  id: '76ab2634-5973-4bbb-b28d-6c19bcf953a1', roundId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', participantId: '8d632d5f-16b1-4292-99e5-0d3628914c2c',
  participantName: 'Sam Rivera', ticketId: '4d9ec244-a97a-4c8c-a657-1e7fd5b9be69', eventId: '91c16f5c-7285-4fc2-9954-7043a0d6e5b4', eventTitle: 'Tech Tombola',
  patternType: 'EARLY_5', status: 'PENDING_VERIFICATION', rejectionReason: null, createdAt: '2026-10-17T10:00:00.000Z', verifiedAt: null,
};
const winner = {
  id: 'd89d76f6-86a3-4ef6-8c4a-fdbbf1319480', claimId: claim.id, participantId: claim.participantId, roundId: claim.roundId, eventId: claim.eventId,
  patternType: 'EARLY_5', participantName: claim.participantName, eventTitle: claim.eventTitle, verifiedAt: '2026-10-17T10:05:00.000Z',
};
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());

describe('admin Claims API', () => {
  it('filters pending claims by round on the server before pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [claim], total: 61, page: 2, limit: 50 }));
    vi.stubGlobal('fetch', fetchMock);
    await listAdminClaims({ roundId: claim.roundId, status: 'PENDING_VERIFICATION', page: 2 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://example.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: '2', limit: '50', roundId: claim.roundId, status: 'PENDING_VERIFICATION' });
  });
  it('loads the actual paginated Claim DTO and sends the documented page contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [claim], total: 61, page: 2, limit: 20 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listAdminClaims({ page: 2, limit: 20 })).resolves.toMatchObject({ total: 61, page: 2, data: [{ id: claim.id }] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/claims?page=2&limit=20');
  });

  it('sends a bodyless verified command with its idempotency key and parses the server Winner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ winner })); vi.stubGlobal('fetch', fetchMock);
    await expect(verifyAdminClaim(claim.id, 'verify-key')).resolves.toMatchObject({ winner: { claimId: claim.id } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/claims/${claim.id}/verify`);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe('verify-key');
    expect(options.body).toBeUndefined();
  });

  it('sends a bodyless rejection command and parses the backend-selected rejection reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ claim: { id: claim.id, status: 'REJECTED', rejectionReason: 'ADMIN_REJECTED' } })); vi.stubGlobal('fetch', fetchMock);
    await expect(rejectAdminClaim(claim.id, 'reject-key')).resolves.toMatchObject({ claim: { status: 'REJECTED', rejectionReason: 'ADMIN_REJECTED' } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/claims/${claim.id}/reject`);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe('reject-key');
    expect(options.body).toBeUndefined();
  });

  it('rejects an unknown Claim state before it enters the UI cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: [{ ...claim, status: 'APPROVED' }], total: 1, page: 1, limit: 20 })));
    await expect(listAdminClaims()).rejects.toThrow();
  });
});
