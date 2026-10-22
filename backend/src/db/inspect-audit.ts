import { getSqlClient } from './client.ts';

async function main() {
  const sql = getSqlClient();
  const logs = await sql`
    SELECT id, actor_id, actor_type, action, resource_type, resource_id, metadata, created_at 
    FROM audit_logs 
    ORDER BY created_at DESC 
    LIMIT 15
  `;
  console.log('Recent audit logs:', JSON.stringify(logs, null, 2));
  await sql.end();
}

main().catch(console.error);
