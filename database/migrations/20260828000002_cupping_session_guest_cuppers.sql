-- Guest cuppers: visitors with no profile who still cup with the lab.
-- Printed on cupping cards by name; nothing is scored against them yet
-- (cupping_scores.cupper_id is an FK to profiles).
ALTER TABLE cupping_sessions
  ADD COLUMN IF NOT EXISTS guest_cuppers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN cupping_sessions.guest_cuppers IS
  'Guest cuppers with no profile: [{"id": uuid, "name": text}]. Printed on cards; no scores are recorded against them yet.';
