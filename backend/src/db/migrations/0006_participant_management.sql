CREATE TABLE IF NOT EXISTS participant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  external_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  email_delivery_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  email_delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_participants_user_event UNIQUE (user_id, event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_event_external_id
  ON participant_profiles (event_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS participant_profiles_event_id_idx ON participant_profiles (event_id);
CREATE INDEX IF NOT EXISTS participant_profiles_user_id_idx ON participant_profiles (user_id);
