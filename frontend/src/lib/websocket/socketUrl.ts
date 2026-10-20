import { assertSupportedSocketProtocol } from './deploymentOrigins';

export function socketUrl(path: string, search: URLSearchParams) {
  const base = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const url = new URL(path, base);
  assertSupportedSocketProtocol(url);
  url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
  url.search = search.toString();
  return url.toString();
}
