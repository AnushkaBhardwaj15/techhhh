import { afterEach, describe, expect, it, vi } from 'vitest';
import { importAdminParticipants } from './adminParticipants';

afterEach(() => vi.unstubAllGlobals());
const report = { totalReceived: 3, createdCount: 1, skippedCount: 1, failedCount: 1, errors: [{ rowIndex: 3, email: 'old@example.test', reason: 'Already exists' }, { rowIndex: 4, reason: 'Invalid email address format' }] };

describe('admin Participant import API', () => {
  it('sends the scoped file and idempotency key as multipart and parses the actual report', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['name,email\nSam,sam@example.test'], 'players.csv', { type: 'text/csv' });
    await expect(importAdminParticipants({ eventId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', file, idempotencyKey: 'attempt-1' })).resolves.toEqual(report);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(url).toBe('/api/v1/admin/participants/import');
    expect(headers.get('idempotency-key')).toBe('attempt-1');
    expect(headers.has('content-type')).toBe(false);
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get('eventId')).toBe('0d3aa3e6-4c58-4c36-b363-d5f11640ba52');
    expect((options.body as FormData).get('file')).toMatchObject({ name: 'players.csv' });
  });

  it('rejects malformed import reports instead of inventing summary values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...report, failedCount: 'one' }), { headers: { 'content-type': 'application/json' } })));
    const file = new File(['name,email'], 'players.csv');
    await expect(importAdminParticipants({ eventId: '0d3aa3e6-4c58-4c36-b363-d5f11640ba52', file, idempotencyKey: 'attempt-2' })).rejects.toThrow();
  });
});
