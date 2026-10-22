import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '273aaaec-d430-4371-8300-3434f6cc73df';
  const questions = await sql`SELECT rq.id, ek.value as key_value FROM round_questions rq JOIN event_keys ek ON ek.id = rq.key_id WHERE rq.round_id = ${roundId}`;
  console.log('Round questions count:', questions.length);
  console.log('Round question keys:', questions.map((q: any) => q.key_value));
  await sql.end();
}

main().catch(console.error);
