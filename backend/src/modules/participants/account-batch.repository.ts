import { getSqlClient } from '../../db/client.ts';
import { sql } from 'drizzle-orm';
export async function lockParticipantAccounts(tx: any) { await tx.execute(sql`SELECT pg_advisory_xact_lock(721020)`); }
export async function assignAccountBatch(tx: any, userId: string, batchName?: string) {
  if (batchName) await tx.execute(sql`UPDATE users SET participant_batch_name=${batchName} WHERE id=${userId}`);
}
export async function listAccountBatches() {
  return getSqlClient()`SELECT participant_batch_name AS name,count(*)::int AS total FROM users u WHERE participant_batch_name IS NOT NULL AND participant_removed_at IS NULL AND NOT EXISTS(SELECT 1 FROM admin_profiles a WHERE a.user_id=u.id) GROUP BY participant_batch_name ORDER BY participant_batch_name`;
}
export async function removeAccounts(actorId: string, scope: { userId: string } | { batchName: string }) {
  return getSqlClient().begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(721020)`;
    const removed = await tx`UPDATE users u SET status='INACTIVE',participant_removed_at=now(),updated_at=now()
      WHERE participant_removed_at IS NULL AND NOT EXISTS(SELECT 1 FROM admin_profiles a WHERE a.user_id=u.id)
      AND EXISTS(SELECT 1 FROM participant_profiles p WHERE p.user_id=u.id)
      AND (${'userId' in scope ? scope.userId : null}::uuid IS NULL OR u.id=${'userId' in scope ? scope.userId : null}::uuid)
      AND (${'batchName' in scope ? scope.batchName : null}::text IS NULL OR participant_batch_name=${'batchName' in scope ? scope.batchName : null}) RETURNING id`;
    const ids=removed.map(row => row.id);
    if (ids.length) {
      await tx`UPDATE participant_profiles SET status='INACTIVE' WHERE user_id IN ${tx(ids)}`;
      await tx`UPDATE sessions SET revoked_at=now() WHERE user_id IN ${tx(ids)} AND revoked_at IS NULL`;
    }
    await tx`INSERT INTO audit_logs(id,actor_id,actor_type,action,resource_type,metadata,created_at) VALUES(gen_random_uuid(),${actorId},'ADMIN','PARTICIPANT_REMOVED','participant',${JSON.stringify({ ...scope, removed: ids.length })}::jsonb,now())`;
    return { removed: ids.length };
  });
}
