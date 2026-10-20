import { randomBytes } from 'node:crypto';
import { BadRequestError, ConflictError } from '../../shared/errors/app-error.ts';
import type { AdminRole, UserStatus } from '../../db/schema/users.ts';

export function generateSecureTemporaryPassword(length = 16): string {
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+';
  const all = lowers + uppers + digits + symbols;

  const chars: string[] = [
    lowers[randomBytes(1)[0] % lowers.length],
    uppers[randomBytes(1)[0] % uppers.length],
    digits[randomBytes(1)[0] % digits.length],
    symbols[randomBytes(1)[0] % symbols.length],
  ];

  const remaining = Math.max(0, length - chars.length);
  const bytes = randomBytes(remaining);
  for (let i = 0; i < remaining; i++) {
    chars.push(all[bytes[i] % all.length]);
  }

  // Shuffle array using Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}

export function assertNotSelfMutation(actorId: string, targetUserId: string, actionName: string): void {
  if (actorId === targetUserId) {
    throw new BadRequestError(`Cannot ${actionName} your own account`, 'CANNOT_MUTATE_SELF');
  }
}

export function assertSuperAdminProtection(
  targetRole: AdminRole,
  newStatus: UserStatus | undefined,
  newRole: AdminRole | undefined,
  activeSuperAdminCount: number
): void {
  const isCurrentlySuperAdmin = targetRole === 'SUPER_ADMIN';
  const isLosingSuperAdminStatus =
    isCurrentlySuperAdmin && (newStatus === 'INACTIVE' || (newRole && newRole !== 'SUPER_ADMIN'));

  if (isLosingSuperAdminStatus && activeSuperAdminCount <= 1) {
    throw new ConflictError(
      'Cannot deactivate, delete, or demote the final active Super Admin account',
      'LAST_SUPER_ADMIN_PROTECTED'
    );
  }
}
