import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMe, login, logout } from './auth';

afterEach(() => vi.unstubAllGlobals());

describe('auth API', () => {
  it('parses a valid user returned by login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'PARTICIPANT' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(login('a@example.test', 'secret')).resolves.toMatchObject({ role: 'PARTICIPANT' });
  });
  it('requires account status in the restored session response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'PARTICIPANT' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(getMe()).rejects.toMatchObject({ name: 'ZodError' });
  });
  it('rejects an unknown role from /me', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: 'u1', email: 'a@example.test', name: 'Ari Patel', role: 'OBSERVER', status: 'ACTIVE' } }), { headers: { 'content-type': 'application/json' } })));
    await expect(getMe()).rejects.toMatchObject({ name: 'ZodError' });
  });
  it('accepts idempotent empty logout responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(logout()).resolves.toBeUndefined();
  });
});
