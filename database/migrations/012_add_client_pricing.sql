-- Migration 012: Add Client Pricing and Fee Structure
-- Date: 2025-10-10
-- Purpose: Add pricing models and fee structure for clients

-- Create pricing model enum
DO $$ BEGIN
    CREATE TYPE pricing_model AS ENUM ('per_sample', 'per_pound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create fee payer enum
DO $$ BEGIN
    CREATE TYPE fee_payer AS ENUM (
        'exporter',
        'importer',
        'roaster',
        'final_buyer',
        'client_pays'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add pricing fields to clients table
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS pricing_model pricing_model DEFAULT 'per_sample',
    ADD COLUMN IF NOT EXISTS price_per_sample DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS price_per_pound_cents DECIMAL(10,4), -- Stores cents (e.g., 2.5 = 2.5¢/lb, min 0.25)
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS fee_payer fee_payer DEFAULT 'client_pays',
    ADD COLUMN IF NOT EXISTS payment_terms TEXT,
    ADD COLUMN IF NOT EXISTS billing_notes TEXT;

-- Add bag weight to samples table (for detail tracking, not primary pricing calc)
ALTER TABLE samples
    ADD COLUMN IF NOT EXISTS bag_weight_kg DECIMAL(10,2); -- 30, 59, 60, 70, 1000 (big bag)

-- Add check constraint for minimum price_per_pound_cents (0.25¢ minimum)
ALTER TABLE clients
    ADD CONSTRAINT check_min_price_per_pound
    CHECK (price_per_pound_cents IS NULL OR price_per_pound_cents >= 0.25);

-- Add check constraint for pricing model validation
ALTER TABLE clients
    ADD CONSTRAINT check_pricing_model_values
    CHECK (
        (pricing_model = 'per_sample' AND price_per_sample IS NOT NULL) OR
        (pricing_model = 'per_pound' AND price_per_pound_cents IS NOT NULL) OR
        (pricing_model IS NULL)
    );

-- Create function to calculate sample fee
CREATE OR REPLACE FUNCTION calculate_sample_fee(
    client_id_param UUID,
    sample_id_param UUID
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    client_record RECORD;
    sample_record RECORD;
    total_pounds DECIMAL(12,4);
    fee DECIMAL(10,2);
    cents_per_pound DECIMAL(10,4);
BEGIN
    -- Get client pricing info
    SELECT pricing_model, price_per_sample, price_per_pound_cents
    INTO client_record
    FROM clients
    WHERE id = client_id_param;

    -- If no pricing model, return NULL
    IF client_record.pricing_model IS NULL THEN
        RETURN NULL;
    END IF;

    -- Per sample pricing (simple flat fee)
    IF client_record.pricing_model = 'per_sample' THEN
        RETURN client_record.price_per_sample;
    END IF;

    -- Per pound pricing (based on lot size)
    IF client_record.pricing_model = 'per_pound' THEN
        -- Get sample lot size
        SELECT bags_quantity_mt, bag_count, bag_weight_kg
        INTO sample_record
        FROM samples
        WHERE id = sample_id_param;

        -- Calculate total pounds
        -- Priority: Use bags_quantity_mt if available (most accurate)
        IF sample_record.bags_quantity_mt IS NOT NULL THEN
            -- 1 Metric Ton = 2204.62 pounds
            total_pounds := sample_record.bags_quantity_mt * 2204.62;
        ELSIF sample_record.bag_count IS NOT NULL AND sample_record.bag_weight_kg IS NOT NULL THEN
            -- Calculate from bag count × weight
            -- 1 kg = 2.20462 pounds
            total_pounds := (sample_record.bag_count * sample_record.bag_weight_kg) * 2.20462;
        ELSE
            -- No lot size data, return NULL
            RETURN NULL;
        END IF;

        -- Calculate fee (minimum 0.25¢/lb)
        cents_per_pound := GREATEST(client_record.price_per_pound_cents, 0.25);
        fee := total_pounds * (cents_per_pound / 100);

        RETURN ROUND(fee, 2);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_pricing_model ON clients(pricing_model);
CREATE INDEX IF NOT EXISTS idx_clients_fee_payer ON clients(fee_payer);
CREATE INDEX IF NOT EXISTS idx_samples_bag_weight_kg ON samples(bag_weight_kg);

-- Grant execute permission on fee calculation function
GRANT EXECUTE ON FUNCTION calculate_sample_fee(UUID, UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN clients.pricing_model IS 'Pricing structure: per_sample (flat fee) or per_pound (based on lot size)';
COMMENT ON COLUMN clients.price_per_sample IS 'Fixed price per sample in USD (for per_sample model)';
COMMENT ON COLUMN clients.price_per_pound_cents IS 'Price per pound in cents (minimum 0.25¢) - for per_pound model';
COMMENT ON COLUMN clients.currency IS 'Currency code (default USD)';
COMMENT ON COLUMN clients.fee_payer IS 'Who pays the fee: exporter, importer, roaster, final_buyer, or client_pays';
COMMENT ON COLUMN clients.payment_terms IS 'Payment terms (e.g., Net 30, Net 60, Due on receipt)';
COMMENT ON COLUMN clients.billing_notes IS 'Special billing instructions or notes';
COMMENT ON COLUMN samples.bag_weight_kg IS 'Weight per bag in kg - varies by origin (30, 59, 60, 70, 1000 for big bags)';

COMMENT ON FUNCTION calculate_sample_fee(UUID, UUID) IS 'Calculate fee for a sample based on client pricing model. Uses bags_quantity_mt (M/T) as primary, falls back to bag_count × bag_weight_kg';
