import { describe, expect, it } from 'bun:test';
import { parseEnv, getSafeEnv } from '../../src/config/env.ts';

describe('Configuration parsing & validation', () => {
  const baseValidEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    HOST: '127.0.0.1',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/techtombola_test',
    JWT_SECRET: 'test-jwt-secret-min-length-sufficient',
    SESSION_SECRET: 'test-session-secret-min-length-sufficient',
    EMAIL_PROVIDER_API_KEY: 'test-email-key',
    EMAIL_FROM: 'test@techtombola.internal',
    APP_URL: 'http://localhost:5173',
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'info',
  };

  it('successfully parses valid configuration', () => {
    const config = parseEnv(baseValidEnv as unknown as NodeJS.ProcessEnv);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('test');
    expect(config.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5433/techtombola_test');
  });

  it('does not invent an email provider credential when none is configured', () => {
    const { EMAIL_PROVIDER_API_KEY: _key, ...env } = baseValidEnv;
    expect(parseEnv(env as unknown as NodeJS.ProcessEnv).EMAIL_PROVIDER_API_KEY).toBeUndefined();
  });

  it('normalizes empty string optional variables to undefined', () => {
    const envWithEmptyOptionals = {
      ...baseValidEnv,
      EMAIL_PROVIDER_API_KEY: '',
      EMAIL_PROVIDER_URL: '',
      SUPER_ADMIN_BOOTSTRAP_SECRET: '',
    };
    const parsed = parseEnv(envWithEmptyOptionals as unknown as NodeJS.ProcessEnv);
    expect(parsed.EMAIL_PROVIDER_API_KEY).toBeUndefined();
    expect(parsed.EMAIL_PROVIDER_URL).toBeUndefined();
    expect(parsed.SUPER_ADMIN_BOOTSTRAP_SECRET).toBeUndefined();
  });

  it('fails when DATABASE_URL is missing or invalid', () => {
    const envMissingDb = { ...baseValidEnv, DATABASE_URL: '' };
    expect(() => parseEnv(envMissingDb as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);

    const envInvalidDb = { ...baseValidEnv, DATABASE_URL: 'mysql://localhost:3306/db' };
    expect(() => parseEnv(envInvalidDb as unknown as NodeJS.ProcessEnv)).toThrow(/valid PostgreSQL/);
  });

  it('fails when JWT_SECRET or SESSION_SECRET is missing', () => {
    const envMissingJwt = { ...baseValidEnv, JWT_SECRET: '' };
    expect(() => parseEnv(envMissingJwt as unknown as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);

    const envMissingSession = { ...baseValidEnv, SESSION_SECRET: '' };
    expect(() => parseEnv(envMissingSession as unknown as NodeJS.ProcessEnv)).toThrow(/SESSION_SECRET/);
  });

  it('fails when PORT is invalid', () => {
    const envInvalidPort = { ...baseValidEnv, PORT: '99999' };
    expect(() => parseEnv(envInvalidPort as unknown as NodeJS.ProcessEnv)).toThrow(/Port must be between 1 and 65535/);

    const envZeroPort = { ...baseValidEnv, PORT: '0' };
    expect(() => parseEnv(envZeroPort as unknown as NodeJS.ProcessEnv)).toThrow(/Port must be between 1 and 65535/);
  });

  it('fails when LOG_LEVEL is invalid', () => {
    const envInvalidLogLevel = { ...baseValidEnv, LOG_LEVEL: 'verbose' };
    expect(() => parseEnv(envInvalidLogLevel as unknown as NodeJS.ProcessEnv)).toThrow(/LOG_LEVEL/);
  });

  it('fails when production secrets are shorter than 32 characters', () => {
    const envShortProdSecret = {
      ...baseValidEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'short_secret',
      SESSION_SECRET: 'short_session',
    };
    expect(() => parseEnv(envShortProdSecret as unknown as NodeJS.ProcessEnv)).toThrow(
      /JWT_SECRET must be at least 32 characters long in production/
    );
  });

  it('redacts secrets in getSafeEnv and never exposes plain secrets', () => {
    const config = parseEnv(baseValidEnv as unknown as NodeJS.ProcessEnv);
    const safe = getSafeEnv(config);

    expect(safe.JWT_SECRET).toBe('***');
    expect(safe.SESSION_SECRET).toBe('***');
    expect(safe.EMAIL_PROVIDER_API_KEY).toBe('***');
    expect(safe.DATABASE_URL).toContain('***');
    expect(safe.DATABASE_URL).not.toContain('postgres:postgres');
  });

  it('error messages do not leak secret values', () => {
    try {
      parseEnv({
        ...baseValidEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'super_secret_short_val',
      } as unknown as NodeJS.ProcessEnv);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      expect(msg).not.toContain('super_secret_short_val');
    }
  });
});
