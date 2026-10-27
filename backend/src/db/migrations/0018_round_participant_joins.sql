CREATE TABLE round_participant_joins (
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES participant_profiles(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_id, participant_id)
);
CREATE INDEX round_participant_joins_participant_idx ON round_participant_joins(participant_id);
