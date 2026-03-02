-- Migration: Fix exporter_sample_number unique constraint
-- Date: 2026-03-02
-- Purpose: Allow multiple samples from the same exporter with the same sample number
-- when they have different container numbers (e.g., Cooxupe shipping multiple containers
-- under one contract).
-- The previous constraint UNIQUE(exporter_id, exporter_sample_number) was too strict.
-- New constraint: UNIQUE(exporter_id, exporter_sample_number, container_nr)

-- Drop the old constraint
DROP INDEX IF EXISTS idx_unique_exporter_sample_number;

-- Create new unique constraint that includes container_nr
-- This allows the same exporter + sample number as long as container differs
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_exporter_sample_container
ON samples (exporter_id, exporter_sample_number, COALESCE(container_nr, id::text))
WHERE exporter_sample_number IS NOT NULL;

COMMENT ON INDEX idx_unique_exporter_sample_container IS 'Ensures each exporter uses unique sample number + container combinations. Samples without a container_nr use their own ID as a fallback to maintain uniqueness. NULL exporter_sample_number values are excluded.';

-- Verification
SELECT
    'Migration completed - exporter_sample_number constraint updated to include container_nr' as status,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'samples' AND indexname = 'idx_unique_exporter_sample_container') as new_index_exists,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'samples' AND indexname = 'idx_unique_exporter_sample_number') as old_index_removed;
