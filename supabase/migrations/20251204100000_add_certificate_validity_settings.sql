-- Add certificate validity settings to clients table
-- These settings control whether certificates show a validity period and for how many months

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS certificate_validity_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS certificate_validity_months integer DEFAULT 6;

-- Add comment for documentation
COMMENT ON COLUMN clients.certificate_validity_enabled IS 'Whether certificates for this client should show a validity period';
COMMENT ON COLUMN clients.certificate_validity_months IS 'Number of months the certificate is valid, counting from first day of next month after issue';
