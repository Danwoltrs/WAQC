-- Add importer and roaster fields to samples table
-- These represent the supply chain entities for coffee tracking

ALTER TABLE samples
ADD COLUMN IF NOT EXISTS importer TEXT,
ADD COLUMN IF NOT EXISTS roaster TEXT;

COMMENT ON COLUMN samples.importer IS 'The importing company receiving the coffee';
COMMENT ON COLUMN samples.roaster IS 'The roasting company that will roast the coffee';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_samples_importer ON samples(importer);
CREATE INDEX IF NOT EXISTS idx_samples_roaster ON samples(roaster);
