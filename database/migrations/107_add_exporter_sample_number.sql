-- Migration 107: Add exporter_sample_number field to samples table
-- Date: 2025-11-25
-- Purpose: Add field for exporter's sample identification number (optional, unique per exporter)

-- Add exporter_sample_number column to samples table
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS exporter_sample_number TEXT;

COMMENT ON COLUMN samples.exporter_sample_number IS 'Sample identification number provided by the exporter. One contract can have multiple containers with the same contract number but different sample IDs. Optional field.';

-- Create unique constraint: same exporter cannot use the same sample number twice
-- But different exporters can use the same sample number
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_exporter_sample_number
ON samples (exporter_id, exporter_sample_number)
WHERE exporter_sample_number IS NOT NULL;

COMMENT ON INDEX idx_unique_exporter_sample_number IS 'Ensures each exporter uses unique sample numbers, but allows different exporters to use the same numbers. NULL values are excluded from uniqueness check.';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_samples_exporter_sample_number
ON samples (exporter_sample_number)
WHERE exporter_sample_number IS NOT NULL;

-- Verification query
SELECT
    'Migration 107 completed - exporter_sample_number field added to samples' as status,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'samples' AND column_name = 'exporter_sample_number') as column_exists,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'samples' AND indexname = 'idx_unique_exporter_sample_number') as unique_index_exists,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'samples' AND indexname = 'idx_samples_exporter_sample_number') as lookup_index_exists;
