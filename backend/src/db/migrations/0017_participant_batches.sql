ALTER TABLE participant_profiles ADD COLUMN batch_name VARCHAR(100);
CREATE INDEX participant_profiles_event_batch_idx ON participant_profiles(event_id, batch_name);
