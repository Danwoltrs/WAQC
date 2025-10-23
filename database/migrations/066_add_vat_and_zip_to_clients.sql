-- Add VAT/CNPJ number and ZIP/CEP code to clients table
-- Migration: 066_add_vat_and_zip_to_clients.sql

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS vat_number TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Add comments for documentation
COMMENT ON COLUMN clients.vat_number IS 'VAT number or CNPJ (Brazilian tax ID) for the client';
COMMENT ON COLUMN clients.zip_code IS 'ZIP code or CEP (Brazilian postal code) for the client address';
