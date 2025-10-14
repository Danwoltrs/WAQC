-- Migration 031: Add 3rd Party Laboratory Configuration
-- Date: 2025-10-14
-- Purpose: Add fields to track 3rd party labs, fees, and billing configuration

-- Add new columns to laboratories table
ALTER TABLE laboratories
    ADD COLUMN IF NOT EXISTS is_3rd_party BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS fee_per_sample DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS fee_currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS billing_basis VARCHAR(50) DEFAULT 'approved_only';

-- Add check constraint for billing basis
ALTER TABLE laboratories
    ADD CONSTRAINT laboratories_billing_basis_check
    CHECK (billing_basis IN ('approved_only', 'approved_and_rejected'));

-- Add index for 3rd party labs
CREATE INDEX IF NOT EXISTS idx_laboratories_is_3rd_party ON laboratories(is_3rd_party) WHERE is_3rd_party = true;

-- Comments
COMMENT ON COLUMN laboratories.is_3rd_party IS 'Whether this is a 3rd party laboratory that we pay fees to';
COMMENT ON COLUMN laboratories.fee_per_sample IS 'Fee we pay per sample to this 3rd party lab (in fee_currency)';
COMMENT ON COLUMN laboratories.fee_currency IS 'Currency for the fee (USD, EUR, BRL, etc.)';
COMMENT ON COLUMN laboratories.billing_basis IS 'Whether we pay for approved samples only or approved + rejected';
