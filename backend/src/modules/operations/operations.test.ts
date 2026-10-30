import { describe, expect, it } from 'bun:test';
import type { AuditLogRecord } from '../../db/schema/audit.ts';
import { OperationsService } from './operations.service.ts';
import { auditQuerySchema } from './operations.schemas.ts';
import { serializeAuditRecord } from './operations.serializers.ts';
import type { IOperationsRepository } from './operations.repository.ts';

const timestamp = new Date('2026-10-15T12:00:00.000Z');
const auditRow: AuditLogRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
  actorType: 'ADMIN',
  action: 'ROUND_STARTED',
  resourceType: 'round',
  resourceId: 'round-1',
  metadata: { reason: 'operator' },
  ip: '192.0.2.1',
  userAgent: 'private browser string',
  requestId: 'private-request-id',
  createdAt: timestamp,
};

function repository(overrides: Partial<IOperationsRepository> = {}): IOperationsRepository {
  return {
    getDashboard: async () => ({
      event: null, round: null, participants: 0, drawCount: 0,
      pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational',
    }),
    listAudit: async () => [auditRow],
    getSystemReadModel: async () => ({ recoveryRequiredRounds: 0, latestMigration: null }),
    ...overrides,
  };
}

describe('Operations read models', () => {
  it('uses a consistent empty Dashboard state and includes all process connections', async () => {
    const service = new OperationsService(repository(), { connectionCount: () => 13 });
    expect(await service.getDashboard()).toEqual({
      event: null, round: null, participants: 0, drawCount: 0,
      pendingClaims: 0, verifiedWinners: 0, recoveryRequired: false, systemStatus: 'operational',
      connectedConnections: 13,
    });
  });

  it('returns populated dashboard operational counts and Event-scoped recovery state', async () => {
    const expected = {
      event: { id: 'event-1', title: 'Tech Tambola', status: 'LIVE' },
      round: { id: 'round-1', name: 'Round 1', sequenceNumber: 1, status: 'RECOVERY_REQUIRED' },
      participants: 500, drawCount: 12, pendingClaims: 2, verifiedWinners: 4, recoveryRequired: true, systemStatus: 'recovery_required' as const,
    };
    const service = new OperationsService(repository({ getDashboard: async () => expected }), { connectionCount: () => 8 });
    expect(await service.getDashboard()).toEqual({ ...expected, connectedConnections: 8 });
  });

  it('validates bounded cursor pagination and filters, rejecting unknown filters and invalid ranges', () => {
    expect(auditQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(auditQuerySchema.parse({ limit: '100', action: 'DRAW_CREATED' })).toMatchObject({ limit: 100 });
    expect(auditQuerySchema.safeParse({ page: '2' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ unknown: 'secret' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ from: '2026-10-16T00:00:00Z', to: '2026-10-15T00:00:00Z' }).success).toBe(false);
    expect(auditQuerySchema.safeParse({ cursor: '***' }).success).toBe(false);
  });

  it('uses the supplied audit cursor and returns the next stable cursor for bounded results', async () => {
    const preciseTimestamp = '2026-10-15T12:00:00.123456Z';
    const cursor = Buffer.from(JSON.stringify({ createdAt: preciseTimestamp, id: auditRow.id })).toString('base64url');
    let requestedCursor: unknown;
    const service = new OperationsService(repository({
      listAudit: async (filters) => { requestedCursor = filters.cursor; return [auditRow, { ...auditRow, id: '33333333-3333-4333-8333-333333333333' }]; },
    }));
    const page = await service.listAudit(auditQuerySchema.parse({ cursor, limit: '1' }));
    expect(requestedCursor).toEqual({ createdAt: preciseTimestamp, id: auditRow.id });
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    expect(JSON.parse(Buffer.from(page.nextCursor!, 'base64url').toString()).createdAt).toBe('2026-10-15T12:00:00.000000Z');
    expect(page).not.toHaveProperty('page');
  });

  it('rejects malformed cursor payloads', async () => {
    const service = new OperationsService(repository());
    for (const payload of ['[]', JSON.stringify({ createdAt: '2026-02-31T12:00:00.000001Z', id: auditRow.id })]) {
      const cursor = Buffer.from(payload).toString('base64url');
      await expect(service.listAudit(auditQuerySchema.parse({ cursor }))).rejects.toThrow('Audit cursor is invalid');
    }
  });

  it('returns bounded audit page metadata and excludes network/request fields', async () => {
    let requestedLimit = 0;
    const service = new OperationsService(repository({
      listAudit: async (filters) => { requestedLimit = filters.limit; return [auditRow, { ...auditRow, id: '33333333-3333-4333-8333-333333333333' }]; },
    }));
    const page = await service.listAudit(auditQuerySchema.parse({ limit: '1', actorId: auditRow.actorId }));
    expect(requestedLimit).toBe(1);
    expect(page.limit).toBe(1);
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('ip');
    expect(page.items[0]).not.toHaveProperty('userAgent');
    expect(page.items[0]).not.toHaveProperty('requestId');
  });

  it('keeps audit serialization allowlisted and preserves redacted metadata', () => {
    const serialized = serializeAuditRecord({
      ...auditRow,
      metadata: { reason: 'operator', password: 'must-not-leak', nested: { apiKey: 'must-not-leak-either' } },
    });
    expect(serialized).toEqual({
      id: auditRow.id,
      actorId: auditRow.actorId,
      actorEmail: null,
      actorName: null,
      actorType: 'ADMIN',
      action: 'ROUND_STARTED',
      resourceType: 'round',
      resourceId: 'round-1',
      eventName: null,
      resourceName: null,
      metadata: { reason: 'operator', password: '***', nested: { apiKey: '***' } },
      createdAt: timestamp.toISOString(),
    });
  });

  it('reports a safe database-unready system state without leaking the health error or querying recovery data', async () => {
    const service = new OperationsService(repository({
      getSystemReadModel: async () => { throw new Error('must not run'); },
    }), undefined, async () => ({ ok: false, latencyMs: 1500, error: 'secret connection string' }));
    const system = await service.getSystem();
    expect(system).toMatchObject({
      readiness: { status: 'not_ready', dependencies: { database: 'unavailable', configuration: 'available' } },
      recoveryRequiredRounds: null,
      latestMigration: null,
    });
    expect(JSON.stringify(system)).not.toContain('secret connection string');
  });

  it('reports safe system readiness, migration, and global recovery metadata when available', async () => {
    const service = new OperationsService(repository({
      getSystemReadModel: async () => ({ recoveryRequiredRounds: 2, latestMigration: { version: '0012_winners.sql', appliedAt: timestamp } }),
    }), undefined, async () => ({ ok: true, latencyMs: 4 }), '1.2.3');
    expect(await service.getSystem()).toEqual({
      version: '1.2.3',
      readiness: { status: 'ready', dependencies: { database: 'available', configuration: 'available' } },
      recoveryRequiredRounds: 2,
      latestMigration: { version: '0012_winners.sql', appliedAt: timestamp },
    });
  });
});
