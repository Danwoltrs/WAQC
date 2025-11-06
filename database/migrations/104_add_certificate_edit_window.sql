-- Migration 104: Add certificate edit time window constraint
-- Author: WAQC Development Team
-- Date: 2025-01-06
-- Purpose: Track original issuance time to enforce 24-hour edit window

-- Step 1: Add original_issued_at column to track first issuance time
DO $$
BEGIN
  -- Add original_issued_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'original_issued_at'
  ) THEN
    ALTER TABLE certificates ADD COLUMN original_issued_at TIMESTAMPTZ;
  END IF;
END $$;

-- Step 2: Populate original_issued_at for existing certificates
-- For existing certificates, set original_issued_at = issued_at (they're all first versions)
UPDATE certificates
SET original_issued_at = issued_at
WHERE original_issued_at IS NULL;

-- Step 3: Make original_issued_at NOT NULL now that data is populated
ALTER TABLE certificates ALTER COLUMN original_issued_at SET NOT NULL;

-- Step 4: Set default for new certificates
ALTER TABLE certificates ALTER COLUMN original_issued_at SET DEFAULT NOW();

-- Step 5: Create index for edit window queries
CREATE INDEX IF NOT EXISTS idx_certificates_original_issued_at ON certificates(original_issued_at);

-- Step 6: Add function to check if certificate is editable (within 24 hours)
CREATE OR REPLACE FUNCTION is_certificate_editable(cert_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  original_time TIMESTAMPTZ;
BEGIN
  SELECT original_issued_at INTO original_time
  FROM certificates
  WHERE id = cert_id;

  -- Return true if within 24 hours of original issuance
  RETURN (NOW() - original_time) < INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Add comments
COMMENT ON COLUMN certificates.original_issued_at IS 'Timestamp of the very first version of this certificate (never changes on revisions)';
COMMENT ON FUNCTION is_certificate_editable(UUID) IS 'Returns true if certificate can still be edited (within 24 hours of original issuance)';
