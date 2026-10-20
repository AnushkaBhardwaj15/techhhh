CREATE TABLE IF NOT EXISTS event_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  value VARCHAR(50) NOT NULL,
  normalized_value VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_event_keys_event_normalized UNIQUE (event_id, normalized_value)
);

CREATE INDEX IF NOT EXISTS event_keys_event_id_idx ON event_keys (event_id);

CREATE TABLE IF NOT EXISTS round_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  key_id UUID NOT NULL REFERENCES event_keys(id) ON DELETE RESTRICT,
  question_text VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_round_questions_round_key UNIQUE (round_id, key_id)
);

CREATE INDEX IF NOT EXISTS round_questions_round_id_idx ON round_questions (round_id);
CREATE INDEX IF NOT EXISTS round_questions_key_id_idx ON round_questions (key_id);
