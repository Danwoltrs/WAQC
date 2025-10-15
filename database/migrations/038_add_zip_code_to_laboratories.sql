-- Add zip_code field to laboratories table
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Comment
COMMENT ON COLUMN laboratories.zip_code IS 'Postal/ZIP code for the laboratory address';
