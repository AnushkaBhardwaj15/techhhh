CREATE TABLE IF NOT EXISTS draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  question_id UUID NOT NULL REFERENCES round_questions(id) ON DELETE RESTRICT,
  key_id UUID NOT NULL REFERENCES event_keys(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL,
  draw_mode VARCHAR(20) NOT NULL CHECK (draw_mode IN ('RANDOM', 'MANUAL')),
  question_text VARCHAR(500) NOT NULL,
  key_value VARCHAR(50) NOT NULL,
  drawn_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_draws_round_sequence UNIQUE (round_id, sequence_number),
  CONSTRAINT uq_draws_round_question UNIQUE (round_id, question_id),
  CONSTRAINT uq_draws_round_key UNIQUE (round_id, key_id)
);

CREATE INDEX IF NOT EXISTS draws_round_id_idx ON draws(round_id);
CREATE INDEX IF NOT EXISTS draws_round_id_sequence_idx ON draws(round_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS draws_question_id_idx ON draws(question_id);
CREATE INDEX IF NOT EXISTS draws_key_id_idx ON draws(key_id);
