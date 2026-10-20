CREATE INDEX IF NOT EXISTS audit_logs_created_id_idx
  ON audit_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_id_idx
  ON audit_logs (actor_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_created_id_idx
  ON audit_logs (action, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_action_created_id_idx
  ON audit_logs (actor_id, action, created_at DESC, id DESC);
