import { describe, expect, it } from 'vitest';
import { validateDeploymentOrigins } from './deploymentOrigins';

const validOrigins: Record<string, string>[] = [
  { VITE_API_BASE_URL: 'https://api.example.test', VITE_WS_BASE_URL: 'wss://socket.example.test' },
  { VITE_API_BASE_URL: 'http://api.example.test', VITE_WS_BASE_URL: 'ws://socket.example.test' },
  {},
];

describe('Vite deployment origin validation', () => {
  it.each([
    ['VITE_API_BASE_URL', 'ftp://api.example.test', 'VITE_API_BASE_URL must use http or https'],
    ['VITE_WS_BASE_URL', 'ftp://socket.example.test', 'WebSocket base URL must use http, https, ws, or wss'],
    ['VITE_WS_BASE_URL', 'not an absolute URL', 'Invalid URL'],
    ['VITE_API_BASE_URL', 'https://user:secret@api.example.test', 'VITE_API_BASE_URL must be an origin without credentials, path, query, or fragment'],
    ['VITE_WS_BASE_URL', 'wss://socket.example.test/api', 'VITE_WS_BASE_URL must be an origin without credentials, path, query, or fragment'],
    ['VITE_WS_BASE_URL', 'wss://socket.example.test?token=secret', 'VITE_WS_BASE_URL must be an origin without credentials, path, query, or fragment'],
  ])('rejects invalid %s value %s', (name, value, message) => {
    expect(() => validateDeploymentOrigins({ [name]: value })).toThrow(message);
  });

  it.each(validOrigins)('accepts valid deployment origins', (env) => {
    expect(() => validateDeploymentOrigins(env)).not.toThrow();
  });
});
