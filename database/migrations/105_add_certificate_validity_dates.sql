-- Migration 105: Add certificate validity dates
-- Author: WAQC Development Team
-- Date: 2025-01-06
-- Purpose: Track certificate validity period (6 months starting first of next month)

-- Step 1: Add validity date columns to certificates table
DO $$
BEGIN
  -- Add valid_from column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'valid_from'
  ) THEN
    ALTER TABLE certificates ADD COLUMN valid_from DATE;
  END IF;

  -- Add valid_until column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE certificates ADD COLUMN valid_until DATE;
  END IF;
END $$;

-- Step 2: Create function to calculate certificate validity dates
-- Valid from issuance date, expires 6 months from 1st of next month
CREATE OR REPLACE FUNCTION calculate_certificate_validity(issue_date TIMESTAMPTZ)
RETURNS TABLE(valid_from DATE, valid_until DATE) AS $$
DECLARE
  start_date DATE;
  end_date DATE;
  expiry_start DATE;
BEGIN
  -- Valid from date of issuance
  start_date := issue_date::DATE;

  -- Calculate first day of next month (when expiry countdown starts)
  expiry_start := DATE_TRUNC('month', issue_date)::DATE + INTERVAL '1 month';

  -- Calculate end date (6 months from expiry_start, last day before that month)
  end_date := (expiry_start + INTERVAL '6 months' - INTERVAL '1 day')::DATE;

  RETURN QUERY SELECT start_date, end_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Populate validity dates for existing certificates
UPDATE certificates
SET
  valid_from = (SELECT vf.valid_from FROM calculate_certificate_validity(issued_at) vf),
  valid_until = (SELECT vu.valid_until FROM calculate_certificate_validity(issued_at) vu)
WHERE valid_from IS NULL OR valid_until IS NULL;

-- Step 4: Make validity columns NOT NULL now that data is populated
ALTER TABLE certificates ALTER COLUMN valid_from SET NOT NULL;
ALTER TABLE certificates ALTER COLUMN valid_until SET NOT NULL;

-- Step 5: Create indexes for validity date queries
CREATE INDEX IF NOT EXISTS idx_certificates_valid_from ON certificates(valid_from);
CREATE INDEX IF NOT EXISTS idx_certificates_valid_until ON certificates(valid_until);
CREATE INDEX IF NOT EXISTS idx_certificates_validity_range ON certificates(valid_from, valid_until);

-- Step 6: Create function to check if certificate is currently valid
CREATE OR REPLACE FUNCTION is_certificate_valid(cert_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  cert_valid_from DATE;
  cert_valid_until DATE;
BEGIN
  SELECT valid_from, valid_until INTO cert_valid_from, cert_valid_until
  FROM certificates
  WHERE id = cert_id;

  -- Return true if today is within validity period
  RETURN CURRENT_DATE >= cert_valid_from AND CURRENT_DATE <= cert_valid_until;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Add comments
COMMENT ON COLUMN certificates.valid_from IS 'Certificate validity start date (date of issuance)';
COMMENT ON COLUMN certificates.valid_until IS 'Certificate validity end date (6 months from 1st of next month minus 1 day)';
COMMENT ON FUNCTION calculate_certificate_validity(TIMESTAMPTZ) IS 'Calculates certificate validity: valid from issue date, expires 6 months from 1st of next month';
COMMENT ON FUNCTION is_certificate_valid(UUID) IS 'Returns true if certificate is currently within its validity period';
