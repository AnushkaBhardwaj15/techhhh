const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /secret/i,
  /token/i,
  /auth(orization)?/i,
  /cookie/i,
  /session/i,
  /(api[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?key)/i,
  /credential/i,
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[REDACTED_URL]';
  }
}

export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    if (input.startsWith('postgres://') || input.startsWith('postgresql://')) {
      return redactDatabaseUrl(input) as unknown as T;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = redactSensitiveData(value);
      } else if (typeof value === 'string' && (value.startsWith('postgres://') || value.startsWith('postgresql://'))) {
        result[key] = redactDatabaseUrl(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return input;
}
