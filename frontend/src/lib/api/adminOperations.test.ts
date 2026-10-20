import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSuperAdminSystem, listAdminAudit } from './adminOperations';

const audit = { items: [], limit: 20, hasMore: false, nextCursor: null };
const system = { version: '1.0.0', readiness: { status: 'ready', dependencies: { database: 'available' } }, recoveryRequiredRounds: 0, latestMigration: null };
function response(body: unknown) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }
afterEach(() => vi.unstubAllGlobals());

describe('admin operations API', () => {
  it('sends only specified audit filters and the stable page size', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(audit));
    vi.stubGlobal('fetch', fetchMock);
    await listAdminAudit({ action: 'ROUND_STARTED', from: '2026-10-18T10:00:00.000Z', cursor: 'cursor_1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/audit?limit=20&action=ROUND_STARTED&from=2026-10-18T10%3A00%3A00.000Z&cursor=cursor_1');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include');
  });

  it('reads the Super Admin system endpoint and rejects malformed responses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(system)).mockResolvedValueOnce(response({ ...system, recoveryRequiredRounds: -1 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getSuperAdminSystem()).resolves.toMatchObject({ readiness: { status: 'ready' } });
    await expect(getSuperAdminSystem()).rejects.toThrow();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/super-admin/system', '/api/v1/super-admin/system']);
  });
});
