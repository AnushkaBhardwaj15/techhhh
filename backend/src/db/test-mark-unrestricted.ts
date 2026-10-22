async function main() {
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'anushka@muacm.org', password: 'ParticipantPass123!' })
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Login cookie:', cookie ? 'OK' : 'MISSING');

  const ticketRes = await fetch('http://127.0.0.1:3000/api/v1/participant/ticket', {
    headers: { Cookie: cookie || '' }
  });
  const ticketData = await ticketRes.json();
  const ticketId = ticketData.ticket?.id;
  console.log('Ticket ID:', ticketId);

  // Pick a cell (for instance first cell)
  const cell = ticketData.ticket.cells[0];
  console.log('Testing mark on cell:', cell.id, cell.keyValue);

  const markRes = await fetch(`http://127.0.0.1:3000/api/v1/participant/tickets/${ticketId}/marks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    body: JSON.stringify({ cellId: cell.id })
  });

  console.log('Mark status code:', markRes.status);
  const markBody = await markRes.json();
  console.log('Mark body:', JSON.stringify(markBody, null, 2));

  // Now test unmark
  const unmarkRes = await fetch(`http://127.0.0.1:3000/api/v1/participant/tickets/${ticketId}/marks/${cell.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie || '' }
  });
  console.log('Unmark status code:', unmarkRes.status);
}

main().catch(console.error);
