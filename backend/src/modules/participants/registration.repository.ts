import { getSqlClient } from '../../db/client.ts';
export async function registrationEventId(): Promise<string> {
  return getSqlClient().begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(721019)`;
    const [existing] = await tx`SELECT id FROM events WHERE title='Participant Accounts' ORDER BY created_at LIMIT 1`;
    if (existing) return existing.id as string;
    const [created] = await tx`INSERT INTO events(id,title,status) VALUES(gen_random_uuid(),'Participant Accounts','DRAFT') RETURNING id`;
    return created.id as string;
  });
}
