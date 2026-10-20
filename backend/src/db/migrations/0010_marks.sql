CREATE TABLE IF NOT EXISTS ticket_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES ticket_cells(id) ON DELETE CASCADE,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ticket_marks_ticket_cell UNIQUE (ticket_id, cell_id)
);

CREATE INDEX IF NOT EXISTS ticket_marks_ticket_id_idx ON ticket_marks(ticket_id);
CREATE INDEX IF NOT EXISTS ticket_marks_cell_id_idx ON ticket_marks(cell_id);
