import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '273aaaec-d430-4371-8300-3434f6cc73df';

  // Re-open TOP_LINE pattern with max_winners = 5
  await sql`
    UPDATE round_patterns 
    SET status = 'OPEN', max_winners = 5 
    WHERE round_id = ${roundId} AND pattern_type = 'TOP_LINE'
  `;

  console.log('Re-opened TOP_LINE pattern for round', roundId);
  await sql.end();
}

main().catch(console.error);
