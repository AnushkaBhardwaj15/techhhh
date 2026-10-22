import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const events = await sql`SELECT id, title, status, created_at FROM events ORDER BY created_at DESC`;
  console.log('Events:', events);
  await sql.end();
}

main().catch(console.error);
