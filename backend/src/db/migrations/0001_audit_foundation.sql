CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  metadata JSONB,
  ip VARCHAR(45),
  user_agent TEXT,
  request_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

-- Enforce append-only / immutable semantics at database engine level
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs rows are append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_prevent_mutation ON audit_logs;

CREATE TRIGGER audit_logs_prevent_mutation
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
