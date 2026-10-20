CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES participant_profiles(id) ON DELETE RESTRICT,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  pattern_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VERIFICATION',
  rejection_reason VARCHAR(255),
  verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_claims_round_participant_pattern UNIQUE (round_id, participant_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS claims_round_id_idx ON claims(round_id);
CREATE INDEX IF NOT EXISTS claims_participant_id_idx ON claims(participant_id);
CREATE INDEX IF NOT EXISTS claims_ticket_id_idx ON claims(ticket_id);
CREATE INDEX IF NOT EXISTS claims_round_pattern_status_idx ON claims(round_id, pattern_type, status);
