import { z } from 'zod';
import { closeDb } from './client.ts';
import { bootstrapSuperAdmin } from '../modules/auth/bootstrap.service.ts';

export async function seed() {
  const config = z.object({
    SUPER_ADMIN_EMAIL: z.string().email(),
    SUPER_ADMIN_PASSWORD: z.string().min(12).max(128),
    SUPER_ADMIN_NAME: z.string().trim().min(1).default('Super Admin'),
    SUPER_ADMIN_BOOTSTRAP_SECRET: z.string().min(32),
  }).parse(process.env);
  return bootstrapSuperAdmin({ email: config.SUPER_ADMIN_EMAIL,
    password: config.SUPER_ADMIN_PASSWORD, name: config.SUPER_ADMIN_NAME,
  }, config.SUPER_ADMIN_BOOTSTRAP_SECRET);
}

if (import.meta.main) {
  try {
    await seed();
    console.log('Initial Super Admin created. No other accounts were seeded.');
  } catch (error) {
    // Never print configuration or supplied credentials.
    const exists = error instanceof Error && error.message.includes('already been completed');
    console.error(exists ? 'Super Admin already exists; credentials were preserved.'
      : 'Super Admin setup failed. Check configuration and database availability.');
    if (!exists) process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
