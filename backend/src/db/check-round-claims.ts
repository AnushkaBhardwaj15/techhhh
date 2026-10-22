import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const r = await sql`SELECT id, name, status, event_id FROM rounds WHERE status = 'ACTIVE' LIMIT 1`;
  console.log('Active round:', r);
  if (r[0]) {
    const p = await sql`SELECT pattern_type, enabled, status FROM round_patterns WHERE round_id = ${r[0].id}`;
    console.log('Patterns in DB:', p);
    const d = await sql`SELECT d.id, d.sequence_number, ek.value FROM draws d JOIN event_keys ek ON ek.id = d.key_id WHERE d.round_id = ${r[0].id} ORDER BY d.sequence_number`;
    console.log('Draw count:', d.length, 'Drawn keys:', d.map((x: any) => x.value));
    const c = await sql`SELECT c.id, c.pattern_type, c.status, c.rejection_reason FROM claims c WHERE c.round_id = ${r[0].id}`;
    console.log('Claims:', c);

    const anushka = await sql`SELECT u.email, pp.id as pid FROM users u JOIN participant_profiles pp ON pp.user_id = u.id WHERE u.email = 'anushka@muacm.org'`;
    if (anushka[0]) {
      const tickets = await sql`SELECT t.id FROM tickets t WHERE t.participant_id = ${anushka[0].pid} AND t.round_id = ${r[0].id}`;
      console.log('Anushka ticket:', tickets);
      if (tickets[0]) {
        const cells = await sql`SELECT tc.row_index, tc.col_index, ek.value FROM ticket_cells tc JOIN event_keys ek ON ek.id = tc.key_id WHERE tc.ticket_id = ${tickets[0].id} ORDER BY tc.row_index, tc.col_index`;
        console.log('Anushka ticket cells:');
        for (let row = 0; row < 3; row++) {
          const rowCells = cells.filter((c: any) => c.row_index === row).map((c: any) => c.value);
          console.log(`Row ${row}:`, rowCells);
        }
      }
    }
  }
  await sql.end();
}

main().catch(console.error);
