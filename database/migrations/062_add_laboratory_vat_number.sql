-- Migration: Add VAT/CNPJ number field to laboratories

-- Add vat_number to laboratories
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS vat_number TEXT DEFAULT NULL;

COMMENT ON COLUMN laboratories.vat_number IS 'VAT/CNPJ/Tax ID number for the laboratory entity';

SELECT 'Migration 062: Added vat_number field to laboratories' as status;
