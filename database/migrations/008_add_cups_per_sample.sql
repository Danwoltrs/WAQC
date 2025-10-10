-- Add cups_per_sample field to samples table
-- This field specifies how many cups should be prepared for cupping each sample

ALTER TABLE samples
ADD COLUMN IF NOT EXISTS cups_per_sample INTEGER DEFAULT 5 CHECK (cups_per_sample >= 1 AND cups_per_sample <= 10);

COMMENT ON COLUMN samples.cups_per_sample IS 'Number of cups to prepare for cupping this sample (1-10, default 5)';

-- Update cupping_scores to track individual cup scores
ALTER TABLE cupping_scores
ADD COLUMN IF NOT EXISTS cup_number INTEGER DEFAULT 1 CHECK (cup_number >= 1);

COMMENT ON COLUMN cupping_scores.cup_number IS 'Which cup number this score represents (1-based index)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_cupping_scores_cup_number ON cupping_scores(cup_number);
