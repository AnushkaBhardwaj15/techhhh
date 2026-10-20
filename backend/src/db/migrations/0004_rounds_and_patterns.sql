CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 1),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rounds_event_sequence UNIQUE (event_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS rounds_event_id_idx ON rounds (event_id);
CREATE INDEX IF NOT EXISTS rounds_status_idx ON rounds (status);

CREATE TABLE IF NOT EXISTS round_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  pattern_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_winners INTEGER NOT NULL DEFAULT 1 CHECK (max_winners >= 1),
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_round_patterns_round_type UNIQUE (round_id, pattern_type),
  CONSTRAINT chk_round_patterns_type CHECK (pattern_type IN ('EARLY_5', 'TOP_LINE', 'MIDDLE_LINE', 'BOTTOM_LINE', 'FULL_HOUSE')),
  CONSTRAINT chk_round_patterns_status CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS round_patterns_round_id_idx ON round_patterns (round_id);
