import { reportDiagnostic } from '../diagnostics';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const headers = new Headers(options.headers);
  const requestedMethod = (options.method ?? 'GET').toUpperCase();
  const method = (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).find((value) => value === requestedMethod);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${API_BASE}/api/v1${path}`, {
      ...options,
      signal,
      credentials: 'include',
      headers,
    });
    if (response.status === 204) return undefined;

    const contentType = response.headers.get('content-type') ?? '';
    const body: unknown = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const envelope = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
      const message = typeof envelope === 'object' && envelope !== null && 'message' in envelope && typeof envelope.message === 'string'
        ? envelope.message
        : `Request failed (${response.status})`;
      const code = typeof envelope === 'object' && envelope !== null && 'code' in envelope && typeof envelope.code === 'string'
        ? envelope.code
        : undefined;
      throw new ApiError(response.status, message, code);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status >= 500) reportDiagnostic('api', { ...(method ? { method } : {}), status: error.status });
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      reportDiagnostic('api', { ...(method ? { method } : {}), status: 0 });
      throw new ApiError(0, 'The request timed out. Try again.');
    }
    if (error instanceof TypeError) {
      reportDiagnostic('api', { ...(method ? { method } : {}), status: 0 });
      throw new ApiError(0, 'Unable to reach Tech Tombola. Check your connection and try again.');
    }
    reportDiagnostic('api', method ? { method } : {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
