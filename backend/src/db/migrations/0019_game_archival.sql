ALTER TABLE rounds ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS rounds_visible_games_idx ON rounds(created_at DESC) WHERE archived_at IS NULL;
