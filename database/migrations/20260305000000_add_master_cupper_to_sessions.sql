-- Add master_cupper_id to cupping_sessions
-- This designates which cupper's scores are authoritative for validation, totals, and charts.
-- Other cuppers' scores are recorded for reference only and are never averaged with the master's.

ALTER TABLE cupping_sessions
ADD COLUMN IF NOT EXISTS master_cupper_id UUID REFERENCES profiles(id);

COMMENT ON COLUMN cupping_sessions.master_cupper_id IS 'The designated master cupper whose scores are used as the final/authoritative values. Other cuppers scores are for reference only.';

CREATE INDEX IF NOT EXISTS idx_cupping_sessions_master_cupper ON cupping_sessions(master_cupper_id) WHERE master_cupper_id IS NOT NULL;
