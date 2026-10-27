import { describe, expect, it } from 'bun:test';
import { AuditRepository, memAuditLogs } from '../../src/modules/audit/audit.repository.ts';
import { buildAuditPayload } from '../../src/modules/audit/audit.domain.ts';

// Transactional account/batch changes require durable audit writes. IO failures
// must reach the caller and cannot create phantom in-memory audit entries.
describe('transactional account auditing', () => {
  const payload = buildAuditPayload({ action: 'PARTICIPANTS_REMOVED', actorType: 'ADMIN', resourceType: 'participant_batch' });

  it('propagates audit persistence failure so the surrounding mutation rolls back', async () => {
    const before = memAuditLogs.length;
    const tx = { insert: () => { throw new Error('Audit database unavailable'); } };
    await expect(new AuditRepository().append(payload, tx)).rejects.toThrow('Audit database unavailable');
    expect(memAuditLogs.length).toBe(before);
  });

  it('returns the persisted audit record from the supplied transaction', async () => {
    const record = { ...payload, id: crypto.randomUUID() };
    const tx = { insert: () => ({ values: () => ({ returning: async () => [record] }) }) };
    expect(await new AuditRepository().append(payload, tx)).toEqual(record);
  });
});
