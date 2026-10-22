import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '8679def1-0919-4cfc-b2cd-9d23961b5a5f';

  // Quick join / login as Anushka
  const joinRes = await fetch('http://127.0.0.1:3000/api/v1/auth/quick-join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Anushka Bhardwaj', email: 'anushkarsbhardwaj@gmail.com' }),
  });
  console.log('Quick join:', joinRes.status);
  const cookie = joinRes.headers.get('set-cookie')?.split(';')[0];

  const claimRes = await fetch('http://127.0.0.1:3000/api/v1/participant/claims', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie || '',
    },
    body: JSON.stringify({ roundId, pattern: 'TOP_LINE' }),
  });
  console.log('Claim Top Line status:', claimRes.status);
  const data = await claimRes.json();
  console.log('Claim result:', JSON.stringify(data, null, 2));

  await sql.end();
}

main().catch(console.error);
