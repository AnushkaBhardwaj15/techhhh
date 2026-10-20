import { describe, expect, it } from 'bun:test';
import {
  generateSecureTemporaryPassword,
  assertNotSelfMutation,
  assertSuperAdminProtection,
} from '../../src/modules/admins/admin.domain.ts';
import { BadRequestError, ConflictError } from '../../src/shared/errors/app-error.ts';

describe('Admin Domain Logic & Invariants', () => {
  it('generates secure temporary passwords with required entropy', () => {
    const password = generateSecureTemporaryPassword(20);
    expect(password.length).toBe(20);
    expect(/[a-z]/.test(password) || /[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
  });

  it('prevents self-mutation (deactivation, deletion, demotion)', () => {
    const actorId = '11111111-1111-1111-1111-111111111111';
    expect(() => assertNotSelfMutation(actorId, actorId, 'deactivate')).toThrow(BadRequestError);
    expect(() =>
      assertNotSelfMutation(actorId, '22222222-2222-2222-2222-222222222222', 'deactivate')
    ).not.toThrow();
  });

  it('protects the final active Super Admin account from deactivation or deletion', () => {
    // Only 1 super admin active -> deactivation blocked
    expect(() =>
      assertSuperAdminProtection('SUPER_ADMIN', 'INACTIVE', undefined, 1)
    ).toThrow(ConflictError);

    // Only 1 super admin active -> demotion to ADMIN blocked
    expect(() =>
      assertSuperAdminProtection('SUPER_ADMIN', undefined, 'ADMIN', 1)
    ).toThrow(ConflictError);

    // Multiple super admins active -> deactivation permitted
    expect(() =>
      assertSuperAdminProtection('SUPER_ADMIN', 'INACTIVE', undefined, 2)
    ).not.toThrow();

    // Standard ADMIN deactivation always permitted regardless of count
    expect(() =>
      assertSuperAdminProtection('ADMIN', 'INACTIVE', undefined, 1)
    ).not.toThrow();
  });
});
