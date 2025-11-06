-- Migration 103: Add certificate revision tracking
-- Author: WAQC Development Team
-- Date: 2025-01-06

-- Step 1: Add revision tracking columns to certificates table
DO $$
BEGIN
  -- Add revision_number column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'revision_number'
  ) THEN
    ALTER TABLE certificates ADD COLUMN revision_number INTEGER DEFAULT 1;
  END IF;

  -- Add is_latest column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'is_latest'
  ) THEN
    ALTER TABLE certificates ADD COLUMN is_latest BOOLEAN DEFAULT TRUE;
  END IF;

  -- Add superseded_by column if it doesn't exist (references newer revision)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'superseded_by'
  ) THEN
    ALTER TABLE certificates ADD COLUMN superseded_by UUID REFERENCES certificates(id);
  END IF;
END $$;

-- Step 2: Create certificate_revisions table for audit trail
CREATE TABLE IF NOT EXISTS certificate_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  revised_by UUID NOT NULL REFERENCES auth.users(id),
  revision_reason TEXT NOT NULL,
  changes_made JSONB NOT NULL,
  previous_data JSONB NOT NULL,
  new_data JSONB NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Create indexes on certificate_revisions
CREATE INDEX IF NOT EXISTS idx_certificate_revisions_certificate_id ON certificate_revisions(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificate_revisions_revised_by ON certificate_revisions(revised_by);
CREATE INDEX IF NOT EXISTS idx_certificate_revisions_revised_at ON certificate_revisions(revised_at DESC);

-- Step 4: Create index for finding latest certificates
CREATE INDEX IF NOT EXISTS idx_certificates_is_latest ON certificates(sample_id, is_latest) WHERE is_latest = TRUE;

-- Step 5: Enable RLS on certificate_revisions table
ALTER TABLE certificate_revisions ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read certificate revisions" ON certificate_revisions;
DROP POLICY IF EXISTS "Users can create certificate revisions" ON certificate_revisions;

-- Step 7: Create RLS policies for certificate_revisions
CREATE POLICY "Users can read certificate revisions" ON certificate_revisions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create certificate revisions" ON certificate_revisions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Step 8: Add comments
COMMENT ON TABLE certificate_revisions IS 'Audit trail for certificate edits and revisions';
COMMENT ON COLUMN certificates.revision_number IS 'Version number of this certificate (increments with each revision)';
COMMENT ON COLUMN certificates.is_latest IS 'Indicates if this is the latest/current version of the certificate';
COMMENT ON COLUMN certificates.superseded_by IS 'ID of the newer certificate revision that replaced this one';
COMMENT ON COLUMN certificate_revisions.revision_reason IS 'User-provided reason for revising the certificate';
COMMENT ON COLUMN certificate_revisions.changes_made IS 'Summary of what was changed';
COMMENT ON COLUMN certificate_revisions.previous_data IS 'Complete certificate data before the revision';
COMMENT ON COLUMN certificate_revisions.new_data IS 'Complete certificate data after the revision';
