-- Allocation is not enrollment: only an explicit game join records this timestamp.
ALTER TABLE tickets ADD COLUMN joined_at timestamptz;
