import { closeDb, getDb } from './client.ts';
import { hashPassword } from '../modules/auth/auth.domain.ts';
import { userRepository } from '../modules/auth/user.repository.ts';

export async function seed() {
  return getDb().transaction(async (tx) => {
    await tx.execute("SELECT pg_advisory_xact_lock(721018)");
    const existing = await userRepository.findByEmail('bigboss@muacm.tech', tx);
    if (existing) {
      if (existing.adminProfile?.role !== 'SUPER_ADMIN') throw new Error('Account already exists with a different role');
      return;
    }
    await userRepository.create({ email: 'bigboss@muacm.tech', name: 'Super Admin',
      passwordHash: await hashPassword('password'), status: 'ACTIVE' }, { role: 'SUPER_ADMIN' }, tx);
  });
}
if (import.meta.main) {
  try { await seed(); console.log('Super Admin setup complete. Existing credentials preserved.'); }
  catch { console.error('Super Admin setup failed.'); process.exitCode = 1; }
  finally { await closeDb(); }
}
