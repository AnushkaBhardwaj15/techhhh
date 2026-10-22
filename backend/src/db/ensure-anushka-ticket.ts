import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const activeRound = await sql`SELECT id, name, status, event_id FROM rounds WHERE status = 'ACTIVE' LIMIT 1`;
  console.log('Active round:', activeRound);

  if (activeRound.length > 0) {
    const roundId = activeRound[0].id;
    const anushka = await sql`
      SELECT u.id as user_id, pp.id as participant_id 
      FROM users u 
      JOIN participant_profiles pp ON pp.user_id = u.id 
      WHERE u.email = 'anushka@muacm.org'
    `;

    if (anushka.length > 0) {
      const pId = anushka[0].participant_id;
      // Ensure profile eventId matches round eventId
      await sql`UPDATE participant_profiles SET event_id = ${activeRound[0].event_id} WHERE id = ${pId}`;

      const existingTicket = await sql`SELECT id FROM tickets WHERE participant_id = ${pId} AND round_id = ${roundId}`;
      if (existingTicket.length === 0) {
        // Find any existing ticket in this round to copy keys
        const sample = await sql`SELECT id FROM tickets WHERE round_id = ${roundId} LIMIT 1`;
        const [newT] = await sql`
          INSERT INTO tickets (round_id, participant_id) 
          VALUES (${roundId}, ${pId}) 
          RETURNING id
        `;
        if (sample.length > 0) {
          const cells = await sql`SELECT key_id, row_index, col_index FROM ticket_cells WHERE ticket_id = ${sample[0].id}`;
          for (const c of cells) {
            await sql`
              INSERT INTO ticket_cells (ticket_id, key_id, row_index, col_index)
              VALUES (${newT.id}, ${c.key_id}, ${c.row_index}, ${c.col_index})
            `;
          }
        }
        console.log(`Created ticket ${newT.id} for anushka@muacm.org in active round!`);
      } else {
        console.log(`Ticket already exists for anushka@muacm.org: ${existingTicket[0].id}`);
      }
    }
  }

  await sql.end();
}

main().catch(console.error);
