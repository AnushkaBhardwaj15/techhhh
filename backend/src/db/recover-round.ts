async function main() {
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@techtombola.internal', password: 'AdminPass123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  const roundId = '8679def1-0919-4cfc-b2cd-9d23961b5a5f';

  const recRes = await fetch(`http://127.0.0.1:3000/api/v1/admin/rounds/${roundId}/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie || '',
    },
    body: JSON.stringify({}),
  });
  console.log('Recovery status:', recRes.status, await recRes.json());
}

main().catch(console.error);
