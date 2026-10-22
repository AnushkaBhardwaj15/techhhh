import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  await sql`UPDATE events SET status = 'LIVE' WHERE id = '2ba9995f-9949-446c-88d3-b5abc9f3854d'`;
  console.log('Intro to Frontend status updated to LIVE');
  await sql.end();
}

main().catch(console.error);
