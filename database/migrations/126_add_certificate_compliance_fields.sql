-- Migration 126: Add compliance fields to certificates for auto-approval/rejection system
-- This supports automatic determination of pass/fail based on quality specifications

-- Add is_rejected flag for easy filtering
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS is_rejected BOOLEAN DEFAULT FALSE;

-- Add compliance_violations to store what failed (for display on certificate)
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS compliance_violations JSONB DEFAULT NULL;

-- Update existing certificates - approved ones are not rejected
UPDATE certificates
SET is_rejected = FALSE
WHERE is_rejected IS NULL;

-- Create index for filtering rejected/approved certificates
CREATE INDEX IF NOT EXISTS idx_certificates_is_rejected ON certificates(is_rejected);

-- Add comment for documentation
COMMENT ON COLUMN certificates.is_rejected IS 'True if sample failed quality spec requirements (auto-determined)';
COMMENT ON COLUMN certificates.compliance_violations IS 'JSON array of violation descriptions for rejected certificates';
