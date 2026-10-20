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
  const value = error as { name?: unknown; code?: unknown } | null;
  return {
    message: 'Operation failed; correlate the error code and request ID',
    stack: '',
    type: typeof value?.name === 'string' ? value.name : 'Error',
    code: typeof value?.code === 'string' ? value.code : undefined,
  };
}
