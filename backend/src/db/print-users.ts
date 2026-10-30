import { getSqlClient } from './client.ts';
import { hashPassword } from '../modules/auth/auth.domain.ts';

async function main() {
  const sql = getSqlClient();
  const defaultPassword = 'ParticipantPass123!';
  const defaultAdminPass = 'AdminPass123!';
  const participantHash = await hashPassword(defaultPassword);
  const adminHash = await hashPassword(defaultAdminPass);

  // 1. Ensure anushka@muacm.org exists with password ParticipantPass123!
  const anushkaMuacm = await sql`SELECT id FROM users WHERE email = 'anushka@muacm.org'`;
  if (anushkaMuacm.length === 0) {
    const [user] = await sql`
      INSERT INTO users (email, password_hash, name, status) 
      VALUES ('anushka@muacm.org', ${participantHash}, 'Anushka Bhardwaj', 'ACTIVE') 
      RETURNING id
    `;
    const events = await sql`SELECT id FROM events LIMIT 1`;
    if (events.length > 0) {
      await sql`
        INSERT INTO participant_profiles (user_id, event_id, status)
        VALUES (${user.id}, ${events[0].id}, 'ACTIVE')
      `;
    }
    console.log('Created anushka@muacm.org with password:', defaultPassword);
  } else {
    await sql`UPDATE users SET password_hash = ${participantHash}, status = 'ACTIVE' WHERE email = 'anushka@muacm.org'`;
    console.log('Updated anushka@muacm.org with password:', defaultPassword);
  }

  // 2. Also ensure anushkarsbhardwaj@gmail.com has password ParticipantPass123!
  await sql`UPDATE users SET password_hash = ${participantHash}, status = 'ACTIVE' WHERE email = 'anushkarsbhardwaj@gmail.com'`;
  console.log('Updated anushkarsbhardwaj@gmail.com with password:', defaultPassword);

  // 3. Ensure player@techtombola.internal has password PlayerPass123! and ParticipantPass123!
  await sql`UPDATE users SET password_hash = ${participantHash}, status = 'ACTIVE' WHERE email = 'player@techtombola.internal'`;
  console.log('Updated player@techtombola.internal with password:', defaultPassword);

  // 4. Ensure admin@muacm.org exists and has AdminPass123!
  const adminMuacm = await sql`SELECT id FROM users WHERE email = 'admin@muacm.org'`;
  if (adminMuacm.length === 0) {
    const [adminUser] = await sql`
      INSERT INTO users (email, password_hash, name, status)
      VALUES ('admin@muacm.org', ${adminHash}, 'Tambola Admin', 'ACTIVE')
      RETURNING id
    `;
    await sql`
      INSERT INTO admin_profiles (user_id, role)
      VALUES (${adminUser.id}, 'SUPER_ADMIN')
    `;
    console.log('Created admin@muacm.org with password:', defaultAdminPass);
  } else {
    await sql`UPDATE users SET password_hash = ${adminHash}, status = 'ACTIVE' WHERE email = 'admin@muacm.org'`;
    console.log('Updated admin@muacm.org with password:', defaultAdminPass);
  }

  // 5. Ensure admin@techtombola.internal has password AdminPass123!
  await sql`UPDATE users SET password_hash = ${adminHash}, status = 'ACTIVE' WHERE email = 'admin@techtombola.internal'`;
  console.log('Updated admin@techtombola.internal with password:', defaultAdminPass);

  // 6. Connect ticket for anushka@muacm.org if needed
  const activeRound = await sql`SELECT id, event_id FROM rounds WHERE status = 'ACTIVE' LIMIT 1`;
  if (activeRound.length > 0) {
    const anushkaUser = await sql`SELECT id FROM users WHERE email = 'anushka@muacm.org'`;
    const profile = await sql`SELECT id FROM participant_profiles WHERE user_id = ${anushkaUser[0].id}`;
    if (profile.length > 0) {
      const existingTicket = await sql`SELECT id FROM tickets WHERE participant_id = ${profile[0].id} AND round_id = ${activeRound[0].id}`;
      if (existingTicket.length === 0) {
        // Copy cells from an existing ticket or generate one
        const sampleTicket = await sql`SELECT id FROM tickets WHERE round_id = ${activeRound[0].id} LIMIT 1`;
        if (sampleTicket.length > 0) {
          const [newTicket] = await sql`
            INSERT INTO tickets (round_id, participant_id) 
            VALUES (${activeRound[0].id}, ${profile[0].id}) 
            RETURNING id
          `;
          const cells = await sql`SELECT key_id, row_index, col_index FROM ticket_cells WHERE ticket_id = ${sampleTicket[0].id}`;
          for (const cell of cells) {
            await sql`
              INSERT INTO ticket_cells (ticket_id, key_id, row_index, col_index)
              VALUES (${newTicket.id}, ${cell.key_id}, ${cell.row_index}, ${cell.col_index})
            `;
          }
          console.log(`Assigned ticket ${newTicket.id} to anushka@muacm.org for round ${activeRound[0].id}`);
        }
      }
    }
  }

  console.log('\n--- Credentials Verified and Active ---');
  await sql.end();
}

main().catch(console.error);
