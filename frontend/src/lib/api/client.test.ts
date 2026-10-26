import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('retains the backend request ID on errors and in safe diagnostics', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FAILED', message: 'Unavailable' } }), {
      status: 500, headers: { 'content-type': 'application/json', 'x-request-id': 'req_backend-123' },
    })));
    await expect(apiRequest('/play/current')).rejects.toMatchObject({ requestId: 'req_backend-123' });
    expect(errorLog).toHaveBeenCalledWith('Tech Tombola diagnostic', expect.objectContaining({ correlationId: 'req_backend-123' }));
  });
  it('sends cookie credentials and parses JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('/me')).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });
  it('sets JSON content type for JSON bodies', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/items', { method: 'POST', body: JSON.stringify({ ok: true }) });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('content-type')).toBe('application/json');
  });
  it('leaves multipart content type to Fetch so it can add the boundary', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await apiRequest('/upload', { method: 'POST', body: new FormData() });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('content-type')).toBe(false);
  });
  it('handles empty success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
  it('normalizes JSON and text error envelopes without losing status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' } }), { status: 429, headers: { 'content-type': 'application/json' } })));
    await expect(apiRequest('/auth/login')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', message: 'Slow down' } satisfies Partial<ApiError>);
  });
  it('uses a safe status message for non-JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive upstream details', { status: 503 })));
    await expect(apiRequest('/me')).rejects.toMatchObject({ status: 503, message: 'Request failed (503)' });
  });
  it('logs a safe correlation record for a failed mutation without request or response data', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FAILED', message: 'secret response' } }), { status: 500, headers: { 'content-type': 'application/json' } })));
    await expect(apiRequest('/participants/import', { method: 'POST', body: JSON.stringify({ password: 'secret request' }) })).rejects.toMatchObject({ status: 500 });
    const safeLog = errorLog.mock.calls.find(([label]) => label === 'Tech Tombola diagnostic');
    expect(safeLog?.[1]).toMatchObject({ type: 'api', method: 'POST', status: 500 });
    expect(safeLog?.[1]).toHaveProperty('correlationId');
    expect(JSON.stringify(safeLog?.[1])).not.toMatch(/secret response|secret request|participants\/import/);
  });
  it('does not log expected client errors as console errors', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } }), { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
    expect(errorLog).not.toHaveBeenCalled();
  });
  it('reports network failures without exposing request data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ password: 'secret' }) })).rejects.toThrow('Unable to reach Tech Tombola');
  });
  it('preserves caller cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => options.signal?.aborted
      ? Promise.reject(options.signal.reason)
      : new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true }))));
    await expect(apiRequest('/me', { signal: controller.signal })).rejects.toBeTruthy();
  });
  it('converts request timeouts to a safe retry message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true }))));
    const request = apiRequest('/me');
    const result = expect(request).rejects.toMatchObject({ status: 0, message: 'The request timed out. Try again.' });
    await vi.advanceTimersByTimeAsync(25_000);
    await result;
    vi.useRealTimers();
  });
});
