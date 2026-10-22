import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '8679def1-0919-4cfc-b2cd-9d23961b5a5f';
  await sql`UPDATE rounds SET status = 'ACTIVE' WHERE id = ${roundId}`;
  const res = await sql`SELECT id, name, status FROM rounds WHERE id = ${roundId}`;
  console.log('Updated round status:', res);
  await sql.end();
}

main().catch(console.error);
