type DiagnosticType = 'render' | 'api' | 'websocket';
type SafeMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let localId = 0;
const lastReported = new Map<string, number>();

export function reportDiagnostic(type: DiagnosticType, details: { method?: SafeMethod; status?: number } = {}) {
  try {
    const key = `${type}:${details.method ?? ''}:${details.status ?? ''}`;
    const now = Date.now();
    if (now - (lastReported.get(key) ?? 0) < 30_000) return;
    lastReported.set(key, now);
    const correlationId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `local-${++localId}`;
    console.error('Tech Tombola diagnostic', { correlationId, type, ...details });
  } catch {
    // Diagnostics must not interrupt the error recovery path.
  }
}
