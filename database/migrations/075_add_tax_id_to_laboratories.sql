-- Add tax_id (CNPJ/VAT) column to laboratories table
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS tax_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN laboratories.tax_id IS 'Tax identification number (CNPJ for Brazil, VAT for other countries)';

-- Update existing laboratories with known tax IDs
-- Example: UPDATE laboratories SET tax_id = '12.345.678/0001-90' WHERE name = 'Santos Lab';
