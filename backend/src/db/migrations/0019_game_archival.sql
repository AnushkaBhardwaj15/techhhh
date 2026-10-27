ALTER TABLE rounds ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX rounds_visible_games_idx ON rounds(created_at DESC) WHERE archived_at IS NULL;
