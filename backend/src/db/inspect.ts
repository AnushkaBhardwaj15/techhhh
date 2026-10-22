import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const roundId = '8679def1-0919-4cfc-b2cd-9d23961b5a5f';

  const round = await sql`SELECT id, name, status FROM rounds WHERE id = ${roundId}`;
  console.log('Round:', JSON.stringify(round, null, 2));

  const patterns = await sql`SELECT * FROM round_patterns WHERE round_id = ${roundId}`;
  console.log('Patterns:', JSON.stringify(patterns, null, 2));

  const claims = await sql`
    SELECT c.*, u.name, u.email 
    FROM claims c 
    JOIN participant_profiles p ON p.id = c.participant_id 
    JOIN users u ON u.id = p.user_id 
    WHERE c.round_id = ${roundId}
  `;
  console.log('Claims:', JSON.stringify(claims, null, 2));

  const winners = await sql`SELECT * FROM winners WHERE round_id = ${roundId}`;
  console.log('Winners:', JSON.stringify(winners, null, 2));

  const ticketRows = await sql`
    SELECT t.id, u.email, u.name, r.name as round_name
    FROM tickets t 
    JOIN participant_profiles p ON p.id = t.participant_id 
    JOIN users u ON u.id = p.user_id 
    JOIN rounds r ON r.id = t.round_id
    LIMIT 10
  `;
  console.log('Tickets with 6-digit codes:');
  for (const t of ticketRows) {
    const code = t.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    console.log(`Code: ${code} | Participant: ${t.name} (${t.email}) | UUID: ${t.id}`);
  }

  await sql.end();
}

main().catch(console.error);
