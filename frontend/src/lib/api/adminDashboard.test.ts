import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboard } from './adminDashboard';

afterEach(() => vi.unstubAllGlobals());

const dashboard = {
  event: null, round: null, participants: 0, connectedConnections: 0, drawCount: 0,
  pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational',
};

describe('admin dashboard API', () => {
  it('requests and validates the authoritative dashboard snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(dashboard), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAdminDashboard()).resolves.toEqual(dashboard);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/admin/dashboard');
  });

  it('rejects a response with missing operational metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...dashboard, connectedConnections: undefined }), { headers: { 'content-type': 'application/json' } })));
    await expect(getAdminDashboard()).rejects.toThrow();
  });
});
