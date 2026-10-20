import { describe, expect, it } from 'vitest';
import { auditPageSchema, systemStatusSchema } from './adminOperations';

const auditRecord = {
  id: 'a7e0db2f-61e0-4803-a59e-54e502288653', actorId: null, actorType: 'SYSTEM',
  action: 'ROUND_STARTED', resourceType: 'round', resourceId: 'round-1', metadata: { roundId: 'round-1' },
  createdAt: '2026-10-18T12:00:00.000Z',
};

describe('admin operations response schemas', () => {
  it('accepts a paged redacted audit response with nullable actor and metadata', () => {
    expect(auditPageSchema.parse({ items: [auditRecord], limit: 20, hasMore: true, nextCursor: 'cursor_123' })).toMatchObject({ items: [auditRecord], hasMore: true });
  });

  it('accepts audit records when optional serializer fields are omitted', () => {
    const minimalRecord = { id: auditRecord.id, action: auditRecord.action, resourceType: auditRecord.resourceType, createdAt: auditRecord.createdAt };
    expect(auditPageSchema.parse({ items: [minimalRecord], limit: 20, hasMore: false, nextCursor: null }).items[0]).toEqual(minimalRecord);
  });

  it('rejects audit rows that expose fields the public serializer omits', () => {
    expect(auditPageSchema.safeParse({ items: [{ ...auditRecord, ip: '192.0.2.1' }], limit: 20, hasMore: false, nextCursor: null }).success).toBe(false);
  });

  it('accepts ready and unavailable system read models without secrets', () => {
    expect(systemStatusSchema.parse({ version: '1.0.0', readiness: { status: 'ready', dependencies: { database: 'available', configuration: 'available' } }, recoveryRequiredRounds: 0, latestMigration: { version: '0012_winners.sql', appliedAt: '2026-10-18T12:00:00.000Z' } }).readiness.status).toBe('ready');
    expect(systemStatusSchema.parse({ version: '1.0.0', readiness: { status: 'not_ready', dependencies: { database: 'unavailable', configuration: 'available' } }, recoveryRequiredRounds: null, latestMigration: null }).recoveryRequiredRounds).toBeNull();
  });

  it('rejects an invalid recovery count', () => {
    expect(systemStatusSchema.safeParse({ version: '1.0.0', readiness: { status: 'ready', dependencies: {} }, recoveryRequiredRounds: -1, latestMigration: null }).success).toBe(false);
  });
});
