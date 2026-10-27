import { getDb } from '../../db/client.ts';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/app-error.ts';
import { userRepository } from './user.repository.ts';
import { sessionRepository } from './session.repository.ts';
import { hashPassword, verifyPassword } from './auth.domain.ts';

export async function changeAdminPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await userRepository.findById(userId);
  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.adminProfile?.role ?? '')) throw new ForbiddenError('Administrator access required');
  if (!await verifyPassword(user.passwordHash, currentPassword)) throw new UnauthorizedError('Current password is incorrect');
  const passwordHash = await hashPassword(newPassword);
  await getDb().transaction(async (tx) => {
    await userRepository.updatePassword(userId, passwordHash, tx);
    await sessionRepository.revokeAllForUser(userId, tx);
  });
}
