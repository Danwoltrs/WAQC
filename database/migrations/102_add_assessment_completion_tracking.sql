-- Migration 102: Add completion tracking columns and fix certificates table
-- Author: WAQC Development Team
-- Date: 2025-01-06

-- Step 1: Add completion tracking columns to quality_assessments table
DO $$
BEGIN
  -- Add cupping_complete column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quality_assessments' AND column_name = 'cupping_complete'
  ) THEN
    ALTER TABLE quality_assessments ADD COLUMN cupping_complete BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add grading_complete column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quality_assessments' AND column_name = 'grading_complete'
  ) THEN
    ALTER TABLE quality_assessments ADD COLUMN grading_complete BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Step 2: Create index for faster queries on quality_assessments
CREATE INDEX IF NOT EXISTS idx_quality_assessments_completion
ON quality_assessments(sample_id, cupping_complete, grading_complete);

-- Step 3: Add missing columns to certificates table if they don't exist
DO $$
BEGIN
  -- Add issued_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'issued_at'
  ) THEN
    ALTER TABLE certificates ADD COLUMN issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- Add approved column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'approved'
  ) THEN
    ALTER TABLE certificates ADD COLUMN approved BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Add certificate_data column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'certificate_data'
  ) THEN
    ALTER TABLE certificates ADD COLUMN certificate_data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE certificates ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Step 4: Create indexes on certificates table
CREATE INDEX IF NOT EXISTS idx_certificates_sample_id ON certificates(sample_id);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_by ON certificates(issued_by);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_at ON certificates(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_approved ON certificates(approved);

-- Step 5: Enable RLS on certificates table
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Step 6: Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read certificates" ON certificates;
DROP POLICY IF EXISTS "Users can create certificates" ON certificates;
DROP POLICY IF EXISTS "Users can update their own certificates" ON certificates;
DROP POLICY IF EXISTS "Users can delete their own certificates" ON certificates;

-- Step 7: Create RLS policies for certificates
CREATE POLICY "Users can read certificates" ON certificates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create certificates" ON certificates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own certificates" ON certificates
  FOR UPDATE
  TO authenticated
  USING (issued_by = auth.uid());

CREATE POLICY "Users can delete their own certificates" ON certificates
  FOR DELETE
  TO authenticated
  USING (issued_by = auth.uid());

-- Step 8: Add comments
COMMENT ON TABLE certificates IS 'Quality certificates generated from completed assessments';
COMMENT ON COLUMN quality_assessments.cupping_complete IS 'Indicates whether cupping assessment is complete for this sample';
COMMENT ON COLUMN quality_assessments.grading_complete IS 'Indicates whether grading assessment is complete for this sample';
