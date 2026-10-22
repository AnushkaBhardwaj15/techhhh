import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const users = await sql`SELECT id, email, name FROM users WHERE name ILIKE '%Anushka%'`;
  console.log('User:', users);
  if (users.length > 0) {
    const userId = users[0].id;
    const tickets = await sql`SELECT t.id, t.round_id, r.name as round_name, r.status as round_status FROM tickets t JOIN rounds r ON r.id = t.round_id JOIN participant_profiles pp ON pp.id = t.participant_id WHERE pp.user_id = ${userId}`;
    console.log('Tickets:', tickets);
    for (const t of tickets) {
      const tId = t.id;
      const rId = t.round_id;
      const cells = await sql`SELECT tc.row_index, tc.col_index, ek.value as key_value, tm.id is not null as marked FROM ticket_cells tc JOIN event_keys ek ON ek.id = tc.key_id LEFT JOIN ticket_marks tm ON tm.cell_id = tc.id WHERE tc.ticket_id = ${tId} ORDER BY tc.row_index, tc.col_index`;
      const draws = await sql`SELECT sequence_number, key_value FROM draws WHERE round_id = ${rId} ORDER BY sequence_number`;
      const claims = await sql`SELECT pattern_type, status, rejection_reason FROM claims WHERE ticket_id = ${tId}`;
      console.log(`Ticket ${tId} for round ${t.round_name}:`);
      console.log('Ticket cells:', cells);
      console.log('Round draws:', draws);
      console.log('Claims:', claims);
    }
  }
  await sql.end();
}

main().catch(console.error);
