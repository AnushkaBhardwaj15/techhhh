CREATE TABLE IF NOT EXISTS claim_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
    participant_id UUID NOT NULL REFERENCES participant_profiles(id) ON DELETE RESTRICT,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
    pattern_type VARCHAR(50) NOT NULL,
    attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
    status VARCHAR(50) NOT NULL,
    rejection_reason VARCHAR(255),
    idempotency_key VARCHAR(128),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_attempts_limit 
ON claim_attempts (round_id, participant_id, pattern_type, attempt_number);

CREATE INDEX IF NOT EXISTS idx_claim_attempts_lookup 
ON claim_attempts (round_id, participant_id, pattern_type);
