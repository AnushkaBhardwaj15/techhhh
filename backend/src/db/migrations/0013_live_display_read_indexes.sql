CREATE INDEX IF NOT EXISTS events_live_started_at_idx
  ON events (status, started_at DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS winners_round_pattern_verified_idx
  ON winners (round_id, pattern_type, verified_at, id);
