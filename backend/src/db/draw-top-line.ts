import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '273aaaec-d430-4371-8300-3434f6cc73df';
  const questions = await sql`SELECT rq.id, ek.value FROM round_questions rq JOIN event_keys ek ON ek.id = rq.key_id WHERE rq.round_id = ${roundId} AND ek.value IN ('ARGON2', 'CLOUD', 'TAILWIND')`;
  console.log('Matching questions for Top Line:', questions);

  // Login as admin and draw them
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@techtombola.internal', password: 'AdminPass123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Admin login:', loginRes.status);

  for (const q of questions) {
    const drawRes = await fetch(`http://127.0.0.1:3000/api/v1/admin/rounds/${roundId}/draws/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `draw-${q.id}-${Date.now()}`,
        Cookie: cookie || '',
      },
      body: JSON.stringify({ questionId: q.id }),
    });
    const data = await drawRes.json();
    console.log(`Drew ${q.value} (status ${drawRes.status}):`, data);
  }

  await sql.end();
}

main().catch(console.error);
