-- Add cups_per_sample column to client_qualities table
-- This allows configuring the number of cups per sample for each quality assignment
-- Different clients may require different numbers of cups for the same quality
-- Example: Blaser Normal = 10 cups, Blaser Nespresso = 5 cups

ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS cups_per_sample INTEGER DEFAULT 10 CHECK (cups_per_sample > 0 AND cups_per_sample <= 20);

COMMENT ON COLUMN client_qualities.cups_per_sample IS 'Number of cups to prepare per sample for cupping sessions. Defaults to 5 if not specified.';
