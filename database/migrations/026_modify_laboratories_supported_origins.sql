-- Migration 026: Modify Laboratories Table for Supported Origins
-- Date: 2025-10-14
-- Purpose: Add supported origins and active status to laboratories

-- Add new columns to laboratories table
ALTER TABLE laboratories
    ADD COLUMN IF NOT EXISTS supported_origins TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add index for active labs
CREATE INDEX IF NOT EXISTS idx_laboratories_is_active ON laboratories(is_active) WHERE is_active = true;

-- Add index for supported origins (GIN for array operations)
CREATE INDEX IF NOT EXISTS idx_laboratories_supported_origins ON laboratories USING GIN(supported_origins);

-- Update existing laboratories to be active
UPDATE laboratories SET is_active = true WHERE is_active IS NULL;

-- Set default supported origins for existing labs based on location
UPDATE laboratories SET supported_origins = ARRAY['Brazil'] WHERE location LIKE '%Brazil%' AND supported_origins = '{}';
UPDATE laboratories SET supported_origins = ARRAY['Colombia'] WHERE location LIKE '%Colombia%' AND supported_origins = '{}';

-- Comments
COMMENT ON COLUMN laboratories.supported_origins IS 'Array of origin countries this lab handles (e.g., {Peru, Mexico, El Salvador, Nicaragua, Honduras})';
COMMENT ON COLUMN laboratories.is_active IS 'Whether this laboratory is currently active and accepting samples';
