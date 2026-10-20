import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import postgres from 'postgres';
import { runMigrations } from '../../src/db/migrate.ts';
import { checkMigrations } from '../../src/db/check.ts';
import { checkDbHealth, closeDb, getDb } from '../../src/db/client.ts';
import { healthCheckFixtures } from '../../src/db/schema/foundation.ts';
import { buildApp } from '../../src/app.ts';
import { ERROR_CODES } from '../../src/config/constants.ts';
import { resetCachedEnv } from '../../src/config/env.ts';
import { RecoveryService } from '../../src/modules/recovery/recovery.service.ts';

class NoopRecoveryService extends RecoveryService {
  override async markInterruptedRounds(): Promise<string[]> {
    return [];
  }
}

describe('Database and Migration Harness', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';
  });

  afterAll(async () => {
    await closeDb();
  });

  it('runs migrations cleanly and checkMigrations detects up to date state', async () => {
    const migrationResult = await runMigrations(testDbUrl);
    expect(migrationResult.total).toBeGreaterThanOrEqual(1);

    const checkResult = await checkMigrations(testDbUrl);
    expect(checkResult.isUpToDate).toBe(true);
    expect(checkResult.pending).toHaveLength(0);
    expect(checkResult.applied).toContain('0000_foundation.sql');
  });

  it('can insert and retrieve rows from health_check_fixtures', async () => {
    const db = getDb(testDbUrl);

    const inserted = await db
      .insert(healthCheckFixtures)
      .values({ name: 'test_fixture_1' })
      .returning();

    expect(inserted).toHaveLength(1);
    expect(inserted[0].name).toBe('test_fixture_1');
    expect(inserted[0].id).toBeDefined();

    const retrieved = await db.select().from(healthCheckFixtures);
    expect(retrieved.length).toBeGreaterThanOrEqual(1);
  });

  it('checkDbHealth returns ok=true when database is reachable', async () => {
    const health = await checkDbHealth(2000);
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('checkDbHealth returns ok=false when database host is unreachable', async () => {
    const deadSql = postgres('postgresql://postgres:postgres@127.0.0.1:54399/nonexistent', {
      connect_timeout: 1,
      max: 1,
    });

    try {
      const health = await checkDbHealth(500, deadSql);
      expect(health.ok).toBe(false);
      expect(health.error).toBeDefined();
    } finally {
      await deadSql.end();
    }
  });

  it('GET /ready returns 503 when database is unavailable', async () => {
    await closeDb();
    resetCachedEnv();
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54399/nonexistent';

    const app = await buildApp({ enableLogging: false, recoveryService: new NoopRecoveryService() });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(body.error.message).toBe('Database is unavailable');
      expect(body.requestId).toBeDefined();
    } finally {
      await app.close();
      await closeDb();
      process.env.DATABASE_URL = originalUrl;
      resetCachedEnv();
    }
  });
});
