import { getSqlClient } from './client.ts';
import { signAuthToken, SESSION_COOKIE_NAME } from '../modules/auth/auth.domain.ts';

async function main() {
  const sql = getSqlClient();
  const anushka = await sql`
    SELECT u.id as user_id, u.email, u.name, pp.id as participant_id, pp.event_id 
    FROM users u 
    JOIN participant_profiles pp ON pp.user_id = u.id 
    WHERE u.email = 'anushka@muacm.org'
  `;

  if (!anushka[0]) {
    console.log('Anushka not found');
    await sql.end();
    return;
  }

  const user = anushka[0];
  console.log('Anushka:', user);

  const activeRound = await sql`SELECT id, name, status, event_id FROM rounds WHERE status = 'ACTIVE' LIMIT 1`;
  console.log('Active round:', activeRound[0]);

  // Create session
  const [session] = await sql`
    INSERT INTO sessions (user_id, expires_at)
    VALUES (${user.user_id}, NOW() + interval '1 day')
    RETURNING id
  `;

  const token = signAuthToken({
    sub: user.user_id,
    email: user.email,
    name: user.name,
    role: 'PARTICIPANT',
    eventId: user.event_id,
    jti: session.id,
  });

  // Call /api/v1/participant/draws
  const res = await fetch(`http://127.0.0.1:3000/api/v1/participant/draws?roundId=${activeRound[0].id}&limit=100`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  });

  console.log('GET /participant/draws status:', res.status);
  const data = await res.json();
  console.log('GET /participant/draws result total:', data.total, 'items count:', data.data?.length);
  if (data.data?.length > 0) {
    console.log('Latest 3 draws:', data.data.slice(-3));
  } else {
    console.log('Data:', data);
  }

  await sql.end();
}

main().catch(console.error);
