import { describe, expect, it } from 'bun:test';
import { ConflictError, UnauthorizedError } from '../../shared/errors/app-error.ts';
import { bootstrapSuperAdmin, type BootstrapDependencies } from './bootstrap.service.ts';

function dependencies(overrides: Partial<BootstrapDependencies> = {}) {
  const user = { id: 'admin-1', email: 'owner@example.test', name: 'Owner', adminProfile: { role: 'SUPER_ADMIN' } };
  const calls: unknown[] = [];
  const base: BootstrapDependencies = {
    getConfiguredSecret: () => 'bootstrap-secret',
    hashPassword: async (password) => { calls.push(['hash', password]); return 'hashed-password'; },
    repository: {
      withBootstrapLock: async (operation) => operation(undefined as never),
      hasSuperAdmin: async () => false,
    },
    users: {
      findByEmail: async () => null,
      create: async (input) => { calls.push(['create', input]); return user as any; },
    },
    recordAudit: async (input) => { calls.push(['audit', input]); return null as any; },
  };
  return { calls, dependencies: { ...base, ...overrides } };
}

describe('Super Admin bootstrap service', () => {
  it('checks the configured secret before hashing and creates one normalized Super Admin', async () => {
    const fixture = dependencies();
    const result = await bootstrapSuperAdmin(
      { email: ' Owner@Example.Test ', name: ' Owner ', password: 'a-long-password' },
      'bootstrap-secret',
      { requestId: 'request-1' },
      fixture.dependencies,
    );

    expect(result).toEqual({ id: 'admin-1', email: 'owner@example.test', name: 'Owner', role: 'SUPER_ADMIN' });
    expect(fixture.calls).toEqual([
      ['hash', 'a-long-password'],
      ['create', { email: 'owner@example.test', name: 'Owner', passwordHash: 'hashed-password', status: 'ACTIVE' }],
      ['audit', expect.objectContaining({ action: 'SUPER_ADMIN_BOOTSTRAPPED', metadata: { email: 'owner@example.test' } })],
    ]);
  });

  it('rejects missing or incorrect bootstrap secrets before hashing or persistence', async () => {
    for (const configuredSecret of [undefined, 'expected-secret']) {
      let touched = false;
      const fixture = dependencies({
        getConfiguredSecret: () => configuredSecret,
        hashPassword: async () => { touched = true; return 'unused'; },
      });
      await expect(bootstrapSuperAdmin(
        { email: 'owner@example.test', name: 'Owner', password: 'password' },
        'wrong-secret',
        undefined,
        fixture.dependencies,
      )).rejects.toBeInstanceOf(UnauthorizedError);
      expect(touched).toBe(false);
    }
  });

  it('rejects an existing Super Admin or duplicate email without creating or auditing an account', async () => {
    const cases = [
      { hasSuperAdmin: true, existingUser: null },
      { hasSuperAdmin: false, existingUser: { id: 'existing-user' } },
    ];
    for (const testCase of cases) {
      let created = false;
      let audited = false;
      const fixture = dependencies({
        repository: {
          withBootstrapLock: async (operation) => operation(undefined as never),
          hasSuperAdmin: async () => testCase.hasSuperAdmin,
        },
        users: {
          findByEmail: async () => testCase.existingUser as any,
          create: async () => { created = true; return null as any; },
        },
        recordAudit: async () => { audited = true; return null as any; },
      });
      await expect(bootstrapSuperAdmin(
        { email: 'owner@example.test', name: 'Owner', password: 'password' },
        'bootstrap-secret', undefined, fixture.dependencies,
      )).rejects.toBeInstanceOf(ConflictError);
      expect(created).toBe(false);
      expect(audited).toBe(false);
    }
  });
});
