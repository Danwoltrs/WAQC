-- Add completion tracking columns to quality_assessments table
ALTER TABLE quality_assessments
ADD COLUMN IF NOT EXISTS cupping_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS grading_complete BOOLEAN DEFAULT FALSE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_quality_assessments_completion
ON quality_assessments(sample_id, cupping_complete, grading_complete);

-- Create certificates table if it doesn't exist
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  issued_by UUID NOT NULL REFERENCES auth.users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  certificate_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Create indexes on certificates
CREATE INDEX IF NOT EXISTS idx_certificates_sample_id ON certificates(sample_id);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_by ON certificates(issued_by);
CREATE INDEX IF NOT EXISTS idx_certificates_issued_at ON certificates(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_approved ON certificates(approved);

-- Add RLS policies for certificates
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read certificates
CREATE POLICY "Users can read certificates" ON certificates
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to create certificates
CREATE POLICY "Users can create certificates" ON certificates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to update their own certificates
CREATE POLICY "Users can update their own certificates" ON certificates
  FOR UPDATE
  TO authenticated
  USING (issued_by = auth.uid());

-- Allow users to delete their own certificates
CREATE POLICY "Users can delete their own certificates" ON certificates
  FOR DELETE
  TO authenticated
  USING (issued_by = auth.uid());

-- Add comment
COMMENT ON TABLE certificates IS 'Quality certificates generated from completed assessments';
COMMENT ON COLUMN quality_assessments.cupping_complete IS 'Indicates whether cupping assessment is complete for this sample';
COMMENT ON COLUMN quality_assessments.grading_complete IS 'Indicates whether grading assessment is complete for this sample';
