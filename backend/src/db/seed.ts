import { sql } from 'drizzle-orm';
import { closeDb, getDb } from './client.ts';
import { hashPassword } from '../modules/auth/auth.domain.ts';
import { userRepository } from '../modules/auth/user.repository.ts';

export async function seed() {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(721018)`);
    const existing = await userRepository.findByEmail('bigboss@muacm.tech', tx);
    if (existing) {
      if (existing.adminProfile?.role !== 'SUPER_ADMIN') throw new Error('Account already exists with a different role');
    } else {
      await userRepository.create({ email: 'bigboss@muacm.tech', name: 'Super Admin',
        passwordHash: await hashPassword('password'), status: 'ACTIVE' }, { role: 'SUPER_ADMIN' }, tx);
    }

    const anushka = await userRepository.findByEmail('anushka.admin@techtombola.internal', tx);
    if (!anushka) {
      await userRepository.create({ email: 'anushka.admin@techtombola.internal', name: 'Anushka Admin',
        passwordHash: await hashPassword('AnushkaAdmin123!'), status: 'ACTIVE' }, { role: 'ADMIN' }, tx);
    }

    const eventRows = await tx.execute(sql`SELECT id FROM events ORDER BY created_at LIMIT 1`);
    const eventId = (eventRows[0]?.id as string) || 'c10ba4b5-cf86-4625-a819-6d3697b0eaa5';

    let anushkaPlayer = await userRepository.findByEmail('anushka@techtombola.internal', tx);
    if (!anushkaPlayer) {
      anushkaPlayer = await userRepository.create({ email: 'anushka@techtombola.internal', name: 'Anushka',
        passwordHash: await hashPassword('AnushkaPass123!'), status: 'ACTIVE' }, undefined, tx);
    }

    if (anushkaPlayer && !anushkaPlayer.participantProfile) {
      await tx.execute(sql`INSERT INTO participant_profiles (id, user_id, event_id, status) VALUES (gen_random_uuid(), ${anushkaPlayer.id}, ${eventId}, 'ACTIVE') ON CONFLICT DO NOTHING`);
    }
  });
}

if (import.meta.main) {
  try { await seed(); console.log('Super Admin & Participant setup complete. Existing credentials preserved.'); }
  catch (err) { console.error('Super Admin setup failed.', err); process.exitCode = 1; }
  finally { await closeDb(); }
}
