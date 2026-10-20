import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { createSuperAdminAccount, deactivateSuperAdminAccount, listSuperAdminAccounts, updateSuperAdminAccount } from './adminAccounts';

afterEach(() => vi.unstubAllGlobals());

const row = {
  id: 'cb82743a-7cb2-4520-b997-2f4830eeb407', profileId: 'e9b872f8-abd2-401f-a07e-ea2b78f1f84c',
  email: 'admin@example.test', name: 'Admin', role: 'ADMIN', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('super-admin account API', () => {
  it('reads paginated account data from the super-admin endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [row], pagination: { page: 2, limit: 10, total: 11, totalPages: 2 } }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(listSuperAdminAccounts({ page: 2, limit: 10 })).resolves.toMatchObject({ pagination: { page: 2, total: 11 }, data: [{ email: row.email }] });
    expect(fetch.mock.calls[0]?.[0]).toContain('/super-admin/admins?page=2&limit=10');
  });

  it('creates an account and accepts its one-time password only in the create response', async () => {
    const oneTimeCredential = crypto.randomUUID();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ admin: row, temporaryPassword: oneTimeCredential }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(createSuperAdminAccount({ email: row.email, name: row.name, role: 'ADMIN' })).resolves.toMatchObject({ temporaryPassword: oneTimeCredential });
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({ email: row.email, name: row.name, role: 'ADMIN' });
  });

  it('validates update payloads and parses the returned account', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ admin: row }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(updateSuperAdminAccount(row.id, { status: 'INACTIVE' })).resolves.toMatchObject({ id: row.id });
    await expect(updateSuperAdminAccount(row.id, {})).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects invalid create roles before sending a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(createSuperAdminAccount({ email: row.email, name: row.name, role: 'PARTICIPANT' } as never)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deactivates with the DELETE contract and accepts an empty success response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(deactivateSuperAdminAccount(row.id)).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('encodes identifiers for deactivation and preserves server protection errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Protected account' } }), { status: 403, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(deactivateSuperAdminAccount('id/segment')).rejects.toBeInstanceOf(ApiError);
    expect(fetch.mock.calls[0]?.[0]).toContain('id%2Fsegment');
  });

  it('rejects malformed account and create responses at the API boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ ...row, passwordHash: 'must-not-leak' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), { headers: { 'content-type': 'application/json' } })));
    await expect(listSuperAdminAccounts()).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ admin: row }), { headers: { 'content-type': 'application/json' } })));
    await expect(createSuperAdminAccount({ email: row.email, name: row.name, role: 'ADMIN' })).rejects.toThrow();
  });
});
