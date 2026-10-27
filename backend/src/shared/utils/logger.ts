export const APP_LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-bootstrap-secret',
  'password',
  'passwordHash',
  'JWT_SECRET',
  'SESSION_SECRET',
  'DATABASE_URL',
  'questionText',
  'keyValue',
  'secret',
  'token',
  '*.password',
  '*.passwordHash',
  '*.questionText',
  '*.keyValue',
  '*.secret',
  '*.token',
];

// Driver messages and parameters can contain credentials or unrevealed Questions.
export function serializeLogError(error: unknown): { type: string; message: string; stack: string; code?: string } {
  const value = error as { name?: unknown; code?: unknown; cause?: unknown } | null;
  const codes: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 6 && !seen.has(current); depth++) {
    seen.add(current);
    const item = current as { code?: unknown; cause?: unknown };
    if (typeof item.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(item.code)) codes.push(item.code);
    current = item.cause;
  }
  const code = codes.find(value => /^[0-9A-Z]{5}$/.test(value)) ?? codes[0];
  const categories: Record<string, string> = {
    '40P01': 'Database deadlock', '40001': 'Database serialization conflict',
    '23505': 'Database unique constraint violation', '23503': 'Database foreign key violation',
    '23514': 'Database check constraint violation', '42703': 'Database column missing; check migrations',
    '42P01': 'Database table missing; check migrations', '53300': 'Database connection limit reached',
    '57014': 'Database query cancelled or timed out', '55P03': 'Database lock unavailable',
    'ECONNREFUSED': 'Database or upstream connection refused', 'ETIMEDOUT': 'Database or upstream timeout',
    'CONNECTION_CLOSED': 'Database connection closed',
  };
  return {
    message: (code && categories[code]) || 'Operation failed; correlate the error code and request ID',
    stack: '',
    type: typeof value?.name === 'string' ? value.name : 'Error',
    code,
  };
}
