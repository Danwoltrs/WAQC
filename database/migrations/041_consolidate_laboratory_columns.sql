-- Consolidate all missing laboratory columns
-- This migration ensures all required columns exist

-- Add address fields if they don't exist
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS neighborhood TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS supported_origins TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add comments for documentation
COMMENT ON COLUMN laboratories.address IS 'Street address of the laboratory';
COMMENT ON COLUMN laboratories.neighborhood IS 'Neighborhood/district of the laboratory';
COMMENT ON COLUMN laboratories.city IS 'City where the laboratory is located';
COMMENT ON COLUMN laboratories.state IS 'State/province where the laboratory is located';
COMMENT ON COLUMN laboratories.zip_code IS 'Postal/ZIP code for the laboratory address';
COMMENT ON COLUMN laboratories.country IS 'Country where the laboratory is located (e.g., Brazil, Colombia, Peru)';
COMMENT ON COLUMN laboratories.contact_email IS 'Primary contact email for the laboratory';
COMMENT ON COLUMN laboratories.contact_phone IS 'Primary contact phone for the laboratory';
COMMENT ON COLUMN laboratories.supported_origins IS 'Array of origin countries this lab handles (e.g., {Peru, Mexico, El Salvador, Nicaragua, Honduras})';
COMMENT ON COLUMN laboratories.is_active IS 'Whether this laboratory is currently active and accepting samples';

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_laboratories_is_active ON laboratories(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_laboratories_supported_origins ON laboratories USING GIN(supported_origins);
CREATE INDEX IF NOT EXISTS idx_laboratories_country ON laboratories(country);

-- Update existing laboratories to set country based on location if possible
UPDATE laboratories SET country = 'Brazil' WHERE location LIKE '%Brazil%' AND country IS NULL;
UPDATE laboratories SET country = 'Colombia' WHERE location LIKE '%Colombia%' AND country IS NULL;
UPDATE laboratories SET country = 'Peru' WHERE location LIKE '%Peru%' AND country IS NULL;
UPDATE laboratories SET country = 'Guatemala' WHERE location LIKE '%Guatemala%' AND country IS NULL;

-- Ensure all laboratories are active by default
UPDATE laboratories SET is_active = true WHERE is_active IS NULL;
