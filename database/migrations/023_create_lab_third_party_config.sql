-- Migration 023: Create Laboratory Third Party Configuration
-- Date: 2025-10-14
-- Purpose: Track 3rd party lab fees, payment terms, and billing configuration

-- Create payment schedule enum
DO $$ BEGIN
    CREATE TYPE payment_schedule AS ENUM ('net_30', 'net_45', 'end_of_next_month');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create billing basis enum
DO $$ BEGIN
    CREATE TYPE billing_basis AS ENUM ('approved_only', 'approved_and_rejected', 'all_samples');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create laboratory third party configuration table
CREATE TABLE IF NOT EXISTS laboratory_third_party_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
    fee_per_sample DECIMAL(10,2) NOT NULL,
    payment_schedule payment_schedule DEFAULT 'net_30',
    billing_basis billing_basis DEFAULT 'approved_only',
    currency VARCHAR(3) DEFAULT 'USD',
    contact_name TEXT,
    contact_email TEXT,
    contract_start_date DATE,
    contract_end_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_laboratory_config UNIQUE(laboratory_id)
);

-- Add check constraint for fee
ALTER TABLE laboratory_third_party_config
    ADD CONSTRAINT check_positive_fee
    CHECK (fee_per_sample > 0);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_third_party_config_lab_id ON laboratory_third_party_config(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_lab_third_party_config_active ON laboratory_third_party_config(laboratory_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lab_third_party_config_schedule ON laboratory_third_party_config(payment_schedule);

-- Add trigger for updated_at
CREATE TRIGGER update_laboratory_third_party_config_updated_at
    BEFORE UPDATE ON laboratory_third_party_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE laboratory_third_party_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Finance users can view lab configs" ON laboratory_third_party_config
    FOR SELECT USING (
        get_user_qc_role(auth.uid()) IN ('santos_hq_finance', 'global_finance_admin', 'global_admin', 'lab_finance_manager')
    );

CREATE POLICY "Finance admins can manage lab configs" ON laboratory_third_party_config
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('global_admin', 'global_finance_admin', 'santos_hq_finance')
    );

-- Comments
COMMENT ON TABLE laboratory_third_party_config IS 'Configuration for 3rd party laboratories including fees and payment terms';
COMMENT ON COLUMN laboratory_third_party_config.fee_per_sample IS 'Fee we pay to 3rd party lab per sample processed';
COMMENT ON COLUMN laboratory_third_party_config.payment_schedule IS 'When we pay: net_30 (30 days), net_45 (45 days), or end_of_next_month';
COMMENT ON COLUMN laboratory_third_party_config.billing_basis IS 'What samples we pay for: approved_only, approved_and_rejected, or all_samples';
COMMENT ON COLUMN laboratory_third_party_config.contact_name IS '3rd party lab primary contact name';
COMMENT ON COLUMN laboratory_third_party_config.contact_email IS '3rd party lab primary contact email';
COMMENT ON COLUMN laboratory_third_party_config.contract_start_date IS 'When contract with 3rd party lab begins';
COMMENT ON COLUMN laboratory_third_party_config.contract_end_date IS 'When contract with 3rd party lab ends';
COMMENT ON TYPE payment_schedule IS 'Payment terms for 3rd party laboratories';
COMMENT ON TYPE billing_basis IS 'Which samples to include in billing calculation';
