-- Allow admins to broadcast/publish an active game to the participant lobby
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS is_broadcast boolean NOT NULL DEFAULT false;
