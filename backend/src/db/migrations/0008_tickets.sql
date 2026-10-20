CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES participant_profiles(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tickets_round_participant UNIQUE (round_id, participant_id)
);

CREATE INDEX IF NOT EXISTS tickets_round_id_idx ON tickets(round_id);
CREATE INDEX IF NOT EXISTS tickets_participant_id_idx ON tickets(participant_id);
CREATE INDEX IF NOT EXISTS tickets_event_id_idx ON tickets(event_id);

CREATE TABLE IF NOT EXISTS ticket_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  key_id UUID NOT NULL REFERENCES event_keys(id) ON DELETE RESTRICT,
  row_index INTEGER NOT NULL CHECK (row_index >= 0 AND row_index <= 2),
  col_index INTEGER NOT NULL CHECK (col_index >= 0 AND col_index <= 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ticket_cells_position UNIQUE (ticket_id, row_index, col_index),
  CONSTRAINT uq_ticket_cells_ticket_key UNIQUE (ticket_id, key_id)
);

CREATE INDEX IF NOT EXISTS ticket_cells_ticket_id_idx ON ticket_cells(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_cells_key_id_idx ON ticket_cells(key_id);
