import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const r = await sql`SELECT id, name, status, event_id FROM rounds WHERE status = 'ACTIVE' LIMIT 1`;
  if (r[0]) {
    const roundQ = await sql`SELECT count(*) FROM round_questions WHERE round_id = ${r[0].id}`;
    console.log('Round questions count:', roundQ[0].count);
    const eventK = await sql`SELECT count(*) FROM event_keys WHERE event_id = ${r[0].event_id}`;
    console.log('Event keys count:', eventK[0].count);
    const allQ = await sql`SELECT rq.id, ek.value, rq.question_text FROM round_questions rq JOIN event_keys ek ON ek.id = rq.key_id WHERE rq.round_id = ${r[0].id}`;
    console.log('Round questions:');
    allQ.forEach((q: any, i: number) => console.log(`${i + 1}. [${q.value}] ${q.question_text}`));
  }
  await sql.end();
}

main().catch(console.error);
