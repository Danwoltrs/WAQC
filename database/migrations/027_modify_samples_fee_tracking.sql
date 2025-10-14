-- Migration 027: Modify Samples Table for Fee Tracking
-- Date: 2025-10-14
-- Purpose: Add calculated fee columns to samples for client and lab fees

-- Add calculated fee columns to samples table
ALTER TABLE samples
    ADD COLUMN IF NOT EXISTS calculated_client_fee DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS calculated_lab_fee DECIMAL(10,2);

-- Add indexes for fee reporting
CREATE INDEX IF NOT EXISTS idx_samples_calculated_client_fee ON samples(calculated_client_fee) WHERE calculated_client_fee IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_samples_calculated_lab_fee ON samples(calculated_lab_fee) WHERE calculated_lab_fee IS NOT NULL;

-- Add composite index for fee calculations by status
CREATE INDEX IF NOT EXISTS idx_samples_fees_by_status ON samples(status, calculated_client_fee, calculated_lab_fee);

-- Comments
COMMENT ON COLUMN samples.calculated_client_fee IS 'Fee to charge client (cached on sample creation/approval) - respects origin pricing';
COMMENT ON COLUMN samples.calculated_lab_fee IS 'Fee owed to 3rd party lab (if applicable) - cached on sample creation/status change';
