CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  resource_type VARCHAR(100) NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys (created_at);
