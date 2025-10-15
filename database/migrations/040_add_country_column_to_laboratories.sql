-- Add country column to laboratories table
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS country TEXT;

-- Add comment
COMMENT ON COLUMN laboratories.country IS 'Country where the laboratory is located (e.g., Brazil, Colombia, Peru)';

-- Update existing laboratories to set country based on location if possible
UPDATE laboratories SET country = 'Brazil' WHERE location LIKE '%Brazil%' AND country IS NULL;
UPDATE laboratories SET country = 'Colombia' WHERE location LIKE '%Colombia%' AND country IS NULL;
UPDATE laboratories SET country = 'Peru' WHERE location LIKE '%Peru%' AND country IS NULL;
UPDATE laboratories SET country = 'Guatemala' WHERE location LIKE '%Guatemala%' AND country IS NULL;
