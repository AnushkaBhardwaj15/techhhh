type DiagnosticType = 'render' | 'api' | 'websocket';
type SafeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let localId = 0;

export function reportDiagnostic(type: DiagnosticType, details: { method?: SafeMethod; status?: number } = {}) {
  try {
    const correlationId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `local-${++localId}`;
    console.error('Tech Tombola diagnostic', { correlationId, type, ...details });
  } catch {
    // Diagnostics must not interrupt the error recovery path.
  }
}
