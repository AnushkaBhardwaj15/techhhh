type DiagnosticType = 'render' | 'api' | 'websocket';
type SafeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let localId = 0;

export function reportDiagnostic(type: DiagnosticType, details: { method?: SafeMethod; status?: number; requestId?: string } = {}) {
  try {
    const { requestId, ...safeDetails } = details;
    const correlationId = requestId && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
      ? requestId
      : typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `local-${++localId}`;
    console.error('Tech Tombola diagnostic', { correlationId, type, ...safeDetails });
  } catch {
    // Diagnostics must not interrupt the error recovery path.
  }
}
