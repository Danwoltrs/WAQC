-- Migration 022: Create Client Origin Pricing Table
-- Date: 2025-10-14
-- Purpose: Enable multi-origin pricing tiers per client

-- Create client origin pricing table
CREATE TABLE IF NOT EXISTS client_origin_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    pricing_model pricing_model NOT NULL,
    price_per_sample DECIMAL(10,2),
    price_per_pound_cents DECIMAL(10,4),
    currency VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_client_origin UNIQUE(client_id, origin)
);

-- Add check constraint for pricing model validation
ALTER TABLE client_origin_pricing
    ADD CONSTRAINT check_origin_pricing_model_values
    CHECK (
        (pricing_model = 'per_sample' AND price_per_sample IS NOT NULL) OR
        (pricing_model = 'per_pound' AND price_per_pound_cents IS NOT NULL AND price_per_pound_cents >= 0.25) OR
        (pricing_model = 'complimentary')
    );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_origin_pricing_client_id ON client_origin_pricing(client_id);
CREATE INDEX IF NOT EXISTS idx_client_origin_pricing_origin ON client_origin_pricing(origin);
CREATE INDEX IF NOT EXISTS idx_client_origin_pricing_active ON client_origin_pricing(client_id, is_active) WHERE is_active = true;

-- Add trigger for updated_at
CREATE TRIGGER update_client_origin_pricing_updated_at
    BEFORE UPDATE ON client_origin_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE client_origin_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view origin pricing for their clients" ON client_origin_pricing
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = client_id
        )
    );

CREATE POLICY "Admins can manage origin pricing" ON client_origin_pricing
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('global_admin', 'global_finance_admin', 'santos_hq_finance')
    );

-- Comments
COMMENT ON TABLE client_origin_pricing IS 'Multi-origin pricing tiers for clients - allows different pricing per country/origin';
COMMENT ON COLUMN client_origin_pricing.origin IS 'Country/origin code (e.g., Brazil, Colombia, Peru, Mexico, El Salvador)';
COMMENT ON COLUMN client_origin_pricing.pricing_model IS 'Pricing model for this specific origin: per_sample, per_pound, or complimentary';
COMMENT ON COLUMN client_origin_pricing.price_per_sample IS 'Fixed price per sample for this origin';
COMMENT ON COLUMN client_origin_pricing.price_per_pound_cents IS 'Price per pound in cents for this origin (minimum 0.25¢)';
COMMENT ON COLUMN client_origin_pricing.is_active IS 'Whether this origin pricing is currently active';
