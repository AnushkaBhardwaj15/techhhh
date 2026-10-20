ALTER TABLE round_patterns
  ADD CONSTRAINT round_patterns_enabled_max_winners_positive
  CHECK (NOT enabled OR max_winners >= 1);

CREATE TABLE winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL UNIQUE REFERENCES claims(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES participant_profiles(id) ON DELETE RESTRICT,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  pattern_type VARCHAR(50) NOT NULL,
  verified_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX winners_participant_verified_at_idx ON winners(participant_id, verified_at DESC, id DESC);
CREATE INDEX winners_verified_at_idx ON winners(verified_at DESC, id DESC);
CREATE INDEX winners_round_pattern_idx ON winners(round_id, pattern_type);

CREATE FUNCTION prevent_winner_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Winner history is immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER winners_are_immutable
  BEFORE UPDATE OR DELETE ON winners
  FOR EACH ROW EXECUTE FUNCTION prevent_winner_mutation();
