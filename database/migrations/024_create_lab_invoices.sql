-- Migration 024: Create Laboratory Invoices Table
-- Date: 2025-10-14
-- Purpose: Track invoices and payments owed to 3rd party laboratories

-- Create invoice status enum
DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM ('pending', 'approved', 'paid', 'disputed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create laboratory invoices table
CREATE TABLE IF NOT EXISTS laboratory_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
    invoice_number TEXT UNIQUE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    due_date DATE NOT NULL,
    status invoice_status DEFAULT 'pending',
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT check_positive_amounts CHECK (sample_count >= 0 AND approved_count >= 0 AND rejected_count >= 0 AND total_amount >= 0),
    CONSTRAINT check_period CHECK (period_end >= period_start),
    CONSTRAINT check_paid_date CHECK (paid_date IS NULL OR status = 'paid')
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_invoices_lab_id ON laboratory_invoices(laboratory_id);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_status ON laboratory_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_due_date ON laboratory_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_period ON laboratory_invoices(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_lab_invoices_number ON laboratory_invoices(invoice_number);

-- Add trigger for updated_at
CREATE TRIGGER update_laboratory_invoices_updated_at
    BEFORE UPDATE ON laboratory_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE laboratory_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Finance users can view lab invoices" ON laboratory_invoices
    FOR SELECT USING (
        get_user_qc_role(auth.uid()) IN ('santos_hq_finance', 'global_finance_admin', 'global_admin', 'lab_finance_manager')
    );

CREATE POLICY "Finance admins can manage lab invoices" ON laboratory_invoices
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('global_admin', 'global_finance_admin', 'santos_hq_finance')
    );

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_lab_invoice_number(lab_id UUID, period_end_date DATE)
RETURNS TEXT AS $$
DECLARE
    lab_code TEXT;
    year_month TEXT;
    sequence_num INTEGER;
    invoice_num TEXT;
BEGIN
    -- Get lab location code (first 3 letters, uppercase)
    SELECT UPPER(SUBSTRING(location FROM 1 FOR 3))
    INTO lab_code
    FROM laboratories
    WHERE id = lab_id;

    -- Format: LAB-YYYYMM-XXX (e.g., GUA-202510-001)
    year_month := TO_CHAR(period_end_date, 'YYYYMM');

    -- Get next sequence number for this lab and month
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM laboratory_invoices
    WHERE laboratory_id = lab_id
    AND invoice_number LIKE lab_code || '-' || year_month || '-%';

    invoice_num := lab_code || '-' || year_month || '-' || LPAD(sequence_num::TEXT, 3, '0');

    RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate due date based on payment schedule
CREATE OR REPLACE FUNCTION calculate_invoice_due_date(
    lab_id UUID,
    invoice_date DATE
)
RETURNS DATE AS $$
DECLARE
    schedule payment_schedule;
    due_dt DATE;
BEGIN
    -- Get payment schedule from lab config
    SELECT payment_schedule
    INTO schedule
    FROM laboratory_third_party_config
    WHERE laboratory_id = lab_id;

    -- Calculate due date based on schedule
    IF schedule = 'net_30' THEN
        due_dt := invoice_date + INTERVAL '30 days';
    ELSIF schedule = 'net_45' THEN
        due_dt := invoice_date + INTERVAL '45 days';
    ELSIF schedule = 'end_of_next_month' THEN
        -- Last day of next month
        due_dt := DATE_TRUNC('month', invoice_date + INTERVAL '2 months') - INTERVAL '1 day';
    ELSE
        -- Default to 30 days
        due_dt := invoice_date + INTERVAL '30 days';
    END IF;

    RETURN due_dt;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_lab_invoice_number(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_invoice_due_date(UUID, DATE) TO authenticated;

-- Comments
COMMENT ON TABLE laboratory_invoices IS 'Tracks invoices and payments owed to 3rd party laboratories';
COMMENT ON COLUMN laboratory_invoices.invoice_number IS 'Unique invoice number in format LAB-YYYYMM-XXX';
COMMENT ON COLUMN laboratory_invoices.period_start IS 'Start date of billing period';
COMMENT ON COLUMN laboratory_invoices.period_end IS 'End date of billing period';
COMMENT ON COLUMN laboratory_invoices.sample_count IS 'Total number of samples in billing period';
COMMENT ON COLUMN laboratory_invoices.approved_count IS 'Number of approved samples in billing period';
COMMENT ON COLUMN laboratory_invoices.rejected_count IS 'Number of rejected samples in billing period';
COMMENT ON COLUMN laboratory_invoices.total_amount IS 'Total amount owed for this invoice';
COMMENT ON COLUMN laboratory_invoices.due_date IS 'Date payment is due';
COMMENT ON COLUMN laboratory_invoices.status IS 'Invoice status: pending, approved, paid, or disputed';
COMMENT ON COLUMN laboratory_invoices.paid_date IS 'Date invoice was marked as paid';
COMMENT ON TYPE invoice_status IS 'Status values for laboratory invoices';
COMMENT ON FUNCTION generate_lab_invoice_number(UUID, DATE) IS 'Generate unique invoice number for laboratory';
COMMENT ON FUNCTION calculate_invoice_due_date(UUID, DATE) IS 'Calculate invoice due date based on lab payment schedule';
