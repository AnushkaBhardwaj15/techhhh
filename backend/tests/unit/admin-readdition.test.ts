import { expect, it, mock } from 'bun:test';
import { AdminService } from '../../src/modules/admins/admin.service.ts';
import { adminRepository } from '../../src/modules/admins/admin.repository.ts';
import { userRepository } from '../../src/modules/auth/user.repository.ts';
import { sessionRepository } from '../../src/modules/auth/session.repository.ts';
import { auditService } from '../../src/modules/audit/audit.service.ts';
import type { getDb } from '../../src/db/client.ts';

function setup(overrides: { status?: string; adminProfile?: object | null; participantProfile?: object | null; restoreFails?: boolean } = {}) {
  const existing = { id: 'admin-1', status: 'INACTIVE', adminProfile: null, participantProfile: null, ...overrides };
  const admins = Object.assign(Object.create(adminRepository), { restoreDeleted: mock(async () => overrides.restoreFails ? null : { id: existing.id, email: 'staff@example.test', name: 'New name', role: 'ADMIN', status: 'ACTIVE' }) });
  const users = Object.assign(Object.create(userRepository), { findByEmail: mock(async () => existing), create: mock(async () => {}) });
  const sessions = Object.assign(Object.create(sessionRepository), { revokeAllForUser: mock(async () => {}) });
  const audit = Object.assign(Object.create(auditService), { record: mock(async () => {}) });
  const tx = { execute: mock(async () => []) };
  const database = (() => ({ transaction: async (work: (tx: object) => Promise<void>) => work(tx) })) as unknown as typeof getDb;
  return { admins, users, sessions, audit, service: new AdminService(admins, users, sessions, audit, database) };
}
const input = { email: ' STAFF@example.test ', name: ' New name ', role: 'ADMIN' as const };

it('restores a deleted administrator with fresh hashed credentials and revoked sessions', async () => {
  const { service, admins, users, sessions, audit } = setup();
  const result = await service.createAdmin('super-admin', input);
  expect(result.admin.id).toBe('admin-1');
  expect(users.create).not.toHaveBeenCalled();
  const [id, name, hash] = admins.restoreDeleted.mock.calls[0]!;
  expect(id).toBe('admin-1');
  expect(name).toBe('New name');
  expect(await Bun.password.verify(result.temporaryPassword, hash)).toBe(true);
  expect(sessions.revokeAllForUser).toHaveBeenCalledTimes(1);
  expect(audit.record).toHaveBeenCalledTimes(1);
});

it.each([
  { status: 'ACTIVE' },
  { adminProfile: { role: 'ADMIN' } },
  { adminProfile: { role: 'SUPER_ADMIN' } },
  { participantProfile: { id: 'participant-1' } },
])('rejects accounts that were not deleted administrators: %j', async (overrides) => {
  const { service, admins } = setup(overrides);
  await expect(service.createAdmin('super-admin', input)).rejects.toThrow('already exists');
  expect(admins.restoreDeleted).not.toHaveBeenCalled();
});

it('rejects a concurrent restoration that has already restored the account', async () => {
  const { service } = setup({ restoreFails: true });
  await expect(service.createAdmin('super-admin', input)).rejects.toThrow('already exists');
});

it('preserves the single Super Admin restriction', async () => {
  const { service, admins } = setup();
  await expect(service.createAdmin('super-admin', { ...input, role: 'SUPER_ADMIN' })).rejects.toThrow('Only one Super Admin');
  expect(admins.restoreDeleted).not.toHaveBeenCalled();
});
