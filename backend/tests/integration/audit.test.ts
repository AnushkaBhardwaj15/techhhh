import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { runMigrations } from '../../src/db/migrate.ts';
import { closeDb, getSqlClient, getDb } from '../../src/db/client.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import { healthCheckFixtures } from '../../src/db/schema/foundation.ts';
import { auditLogs } from '../../src/db/schema/audit.ts';
import { eq } from 'drizzle-orm';

import { resetCachedEnv } from '../../src/config/env.ts';

describe('Audit Foundation Integration', () => {
  const testDbUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/techtombola_test';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDbUrl;
    process.env.JWT_SECRET = 'test-jwt-secret-min-length-sufficient';
    process.env.SESSION_SECRET = 'test-session-secret-min-length-sufficient';

    resetCachedEnv();
    await closeDb();
    await runMigrations(testDbUrl);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('records and retrieves audit events with complete metadata', async () => {
    const record = await auditService.record({
      action: 'LOGIN_SUCCESS',
      actorType: 'ADMIN',
      resourceType: 'auth',
      resourceId: 'admin_login_1',
      metadata: { ip: '127.0.0.1', success: true },
      ip: '127.0.0.1',
      userAgent: 'Integration Test Browser',
      requestId: 'req_audit_test_1',
    });

    expect(record.id).toBeDefined();
    expect(record.action).toBe('LOGIN_SUCCESS');
    expect(record.resourceType).toBe('auth');
    expect(record.requestId).toBe('req_audit_test_1');

    const fetched = await auditService.getById(record.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(record.id);
    expect(fetched?.action).toBe('LOGIN_SUCCESS');
    expect(fetched?.metadata).toEqual({ ip: '127.0.0.1', success: true });
  });

  it('lists audit events filtered by resource and ordered chronologically', async () => {
    const resourceId = `res_${Date.now()}`;

    await auditService.record({
      action: 'ROUND_STARTED',
      resourceType: 'round',
      resourceId,
      metadata: { roundNumber: 1 },
    });

    await auditService.record({
      action: 'ROUND_PAUSED',
      resourceType: 'round',
      resourceId,
      metadata: { roundNumber: 1, reason: 'intermission' },
    });

    const events = await auditService.listByResource('round', resourceId);
    expect(events.length).toBe(2);
    // Ordered descending: ROUND_PAUSED was created after ROUND_STARTED
    expect(events[0].action).toBe('ROUND_PAUSED');
    expect(events[1].action).toBe('ROUND_STARTED');
  });

  it('commits mutation and audit log atomically in the same transaction', async () => {
    const db = getDb();
    const fixtureName = `atomic_tx_fixture_${Date.now()}`;

    let recordedAuditId = '';

    await db.transaction(async (tx) => {
      // 1. Business mutation
      const [fixture] = await tx
        .insert(healthCheckFixtures)
        .values({ name: fixtureName })
        .returning();

      // 2. Audit recording inside same transaction
      const auditLog = await auditService.record(
        {
          action: 'ROUND_STARTED',
          resourceType: 'health_fixture',
          resourceId: fixture.id,
          metadata: { name: fixtureName },
        },
        tx
      );

      recordedAuditId = auditLog.id;
    });

    // Verify both records persisted
    const [persistedFixture] = await db
      .select()
      .from(healthCheckFixtures)
      .where(eq(healthCheckFixtures.name, fixtureName));
    expect(persistedFixture).toBeDefined();

    const persistedAudit = await auditService.getById(recordedAuditId);
    expect(persistedAudit).not.toBeNull();
  });

  it('rolls back mutation and audit record when transaction fails', async () => {
    const db = getDb();
    const fixtureName = `rollback_fixture_${Date.now()}`;
    const testResourceId = `audit_rollback_res_${Date.now()}`;

    let caughtError: Error | null = null;

    try {
      await db.transaction(async (tx) => {
        await tx.insert(healthCheckFixtures).values({ name: fixtureName });

        await auditService.record(
          {
            action: 'ROUND_STARTED',
            resourceType: 'test_rollback',
            resourceId: testResourceId,
          },
          tx
        );

        // Force intentional transaction failure
        throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError?.message).toBe('INTENTIONAL_TRANSACTION_FAILURE');

    // Verify business mutation was rolled back
    const fixtures = await db
      .select()
      .from(healthCheckFixtures)
      .where(eq(healthCheckFixtures.name, fixtureName));
    expect(fixtures).toHaveLength(0);

    // Verify audit record was also rolled back
    const audits = await auditService.listByResource('test_rollback', testResourceId);
    expect(audits).toHaveLength(0);
  });

  it('database trigger rejects UPDATE attempts on audit_logs (append-only enforcement)', async () => {
    const record = await auditService.record({
      action: 'ROUND_COMPLETED',
      resourceType: 'round',
      resourceId: 'immutable_test_round',
    });

    const sql = getSqlClient();

    let updateFailed = false;
    try {
      await sql`UPDATE audit_logs SET action = 'HACKED' WHERE id = ${record.id}`;
    } catch (err: any) {
      updateFailed = true;
      expect(err.message).toContain('audit_logs rows are append-only');
    }

    expect(updateFailed).toBe(true);

    // Verify record remains unchanged
    const unchanged = await auditService.getById(record.id);
    expect(unchanged?.action).toBe('ROUND_COMPLETED');
  });

  it('database trigger rejects DELETE attempts on audit_logs (append-only enforcement)', async () => {
    const record = await auditService.record({
      action: 'ROUND_COMPLETED',
      resourceType: 'round',
      resourceId: 'immutable_delete_test',
    });

    const sql = getSqlClient();

    let deleteFailed = false;
    try {
      await sql`DELETE FROM audit_logs WHERE id = ${record.id}`;
    } catch (err: any) {
      deleteFailed = true;
      expect(err.message).toContain('audit_logs rows are append-only');
    }

    expect(deleteFailed).toBe(true);

    // Verify record still exists
    const stillExists = await auditService.getById(record.id);
    expect(stillExists).not.toBeNull();
  });
});
