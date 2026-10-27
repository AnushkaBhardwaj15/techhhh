ALTER TABLE users ADD COLUMN participant_batch_name VARCHAR(100);
ALTER TABLE users ADD COLUMN participant_removed_at TIMESTAMPTZ;
CREATE INDEX users_participant_batch_idx ON users(participant_batch_name) WHERE participant_removed_at IS NULL;
