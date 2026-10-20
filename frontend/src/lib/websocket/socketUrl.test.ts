import { afterEach, describe, expect, it, vi } from 'vitest';
import { socketUrl } from './socketUrl';

describe('socketUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['http://api.example.test', '', 'ws:', 'api.example.test'],
    ['https://api.example.test', '', 'wss:', 'api.example.test'],
    ['https://api.example.test', 'wss://socket.example.test', 'wss:', 'socket.example.test'],
    ['https://api.example.test', 'ws://socket.example.test', 'ws:', 'socket.example.test'],
  ])('resolves %s with WebSocket override %s', (apiBase, socketBase, protocol, host) => {
    vi.stubEnv('VITE_API_BASE_URL', apiBase);
    vi.stubEnv('VITE_WS_BASE_URL', socketBase);
    const url = new URL(socketUrl('/api/v1/ws', new URLSearchParams({ eventId: 'event-1', roundId: 'round-1' })));
    expect(url.protocol).toBe(protocol);
    expect(url.host).toBe(host);
    expect(url.pathname).toBe('/api/v1/ws');
    expect(url.searchParams.get('eventId')).toBe('event-1');
    expect(url.searchParams.get('roundId')).toBe('round-1');
  });

  it('falls back to the current origin when no API or WebSocket origin is configured', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_WS_BASE_URL', '');
    const url = new URL(socketUrl('/api/v1/ws', new URLSearchParams()));
    expect(url.protocol).toBe('ws:');
    expect(url.host).toBe(window.location.host);
  });

  it('rejects an unsupported configured origin protocol', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.stubEnv('VITE_WS_BASE_URL', 'ftp://socket.example.test');
    expect(() => socketUrl('/api/v1/ws', new URLSearchParams())).toThrow('WebSocket base URL must use http, https, ws, or wss');
  });

  it('rejects an unsupported API origin protocol when used as the socket fallback', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'ftp://api.example.test');
    vi.stubEnv('VITE_WS_BASE_URL', '');
    expect(() => socketUrl('/api/v1/ws', new URLSearchParams())).toThrow('WebSocket base URL must use http, https, ws, or wss');
  });
});
