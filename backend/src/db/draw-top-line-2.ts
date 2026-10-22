import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '8679def1-0919-4cfc-b2cd-9d23961b5a5f';

  // Admin login
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@techtombola.internal', password: 'AdminPass123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];

  const questions = await sql`
    SELECT rq.id as question_id, ek.value as key_value 
    FROM round_questions rq
    JOIN event_keys ek ON ek.id = rq.key_id
    WHERE rq.round_id = ${roundId} AND ek.value IN ('SERVER', 'BROWSER', 'NGINX')
  `;
  console.log('Available questions to draw:', questions);

  for (const q of questions) {
    const drawRes = await fetch(`http://127.0.0.1:3000/api/v1/admin/rounds/${roundId}/draws/manual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookie || '',
      },
      body: JSON.stringify({ questionId: q.question_id }),
    });
    console.log(`Draw ${q.key_value} status:`, drawRes.status);
    if (!drawRes.ok) {
      console.log('Error:', await drawRes.text());
    }
  }

  await sql.end();
}

main().catch(console.error);
