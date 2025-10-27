-- Migration: Add quality_name field to samples table for custom quality descriptions
-- This field is used when a sample doesn't have a quality_spec_id (template)
-- or when users want to provide a custom quality name (especially for type samples)

-- Add quality_name column to samples table
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS quality_name TEXT;

-- Add comment explaining the field's purpose
COMMENT ON COLUMN samples.quality_name IS 'Custom quality name for samples without a quality template, or to override the template name (commonly used for type samples)';

-- Create index for faster filtering by quality name
CREATE INDEX IF NOT EXISTS idx_samples_quality_name ON samples(quality_name) WHERE quality_name IS NOT NULL;
