import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const allRounds = await sql`SELECT id, name, status, event_id FROM rounds ORDER BY sequence_number DESC`;

  if (allRounds.length > 0) {
    const targetRound = allRounds[0];
    await sql`UPDATE rounds SET status = 'ACTIVE' WHERE id = ${targetRound.id}`;
    await sql`UPDATE events SET status = 'LIVE' WHERE id = ${targetRound.event_id}`;
    console.log(`Set round ${targetRound.name} (${targetRound.id}) to ACTIVE!`);

    const anushka = await sql`
      SELECT u.id as user_id, pp.id as participant_id 
      FROM users u 
      JOIN participant_profiles pp ON pp.user_id = u.id 
      WHERE u.email = 'anushka@muacm.org'
    `;

    if (anushka.length > 0) {
      const pId = anushka[0].participant_id;
      await sql`UPDATE participant_profiles SET event_id = ${targetRound.event_id} WHERE id = ${pId}`;

      const existingTicket = await sql`SELECT id FROM tickets WHERE participant_id = ${pId} AND round_id = ${targetRound.id}`;
      if (existingTicket.length === 0) {
        const sample = await sql`SELECT id FROM tickets WHERE round_id = ${targetRound.id} LIMIT 1`;
        const [newT] = await sql`
          INSERT INTO tickets (round_id, participant_id, event_id) 
          VALUES (${targetRound.id}, ${pId}, ${targetRound.event_id}) 
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
        console.log(`Created ticket ${newT.id} for anushka@muacm.org!`);
      } else {
        console.log(`Anushka already has ticket: ${existingTicket[0].id}`);
      }
    }
  }

  await sql.end();
}

main().catch(console.error);
