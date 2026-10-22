import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const sessions = await sql`
    SELECT s.id, s.user_id, s.created_at, u.email, pp.event_id as profile_event_id, e.title as event_title, e.status as event_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN participant_profiles pp ON pp.user_id = u.id
    LEFT JOIN events e ON e.id = pp.event_id
    WHERE u.email ILIKE '%anushka%'
    ORDER BY s.created_at DESC
    LIMIT 5
  `;
  console.log('Anushka sessions:', sessions);
  await sql.end();
}

main().catch(console.error);
