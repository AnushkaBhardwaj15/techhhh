async function main() {
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@techtombola.internal', password: 'AdminPass123!' }),
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  const claimId = 'bad4aa26-1fd9-48a4-b517-c577a0444fd4';

  const verifyRes = await fetch(`http://127.0.0.1:3000/api/v1/admin/claims/${claimId}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      Cookie: cookie || '',
    },
    body: JSON.stringify({}),
  });
  console.log('Verify status:', verifyRes.status);
  const data = await verifyRes.json();
  console.log('Verify result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
