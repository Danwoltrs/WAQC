-- Migration 028: Create Fee Calculation Functions
-- Date: 2025-10-14
-- Purpose: Create enhanced fee calculation functions with origin pricing support

-- Drop old function if exists
DROP FUNCTION IF EXISTS calculate_sample_fee(UUID, UUID);

-- Enhanced client fee calculation with origin pricing support
CREATE OR REPLACE FUNCTION calculate_client_fee(
    client_id_param UUID,
    sample_id_param UUID
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    sample_data RECORD;
    pricing_data RECORD;
    total_pounds DECIMAL(12,4);
    fee DECIMAL(10,2);
    cents_per_pound DECIMAL(10,4);
BEGIN
    -- Get sample data
    SELECT origin, bags_quantity_mt, bag_count, bag_weight_kg
    INTO sample_data
    FROM samples
    WHERE id = sample_id_param;

    -- If sample not found, return NULL
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Check for origin-specific pricing first
    SELECT pricing_model, price_per_sample, price_per_pound_cents
    INTO pricing_data
    FROM client_origin_pricing
    WHERE client_id = client_id_param
      AND origin = sample_data.origin
      AND is_active = true;

    -- If no origin pricing found, fall back to default client pricing
    IF NOT FOUND THEN
        SELECT pricing_model, price_per_sample, price_per_pound_cents
        INTO pricing_data
        FROM clients
        WHERE id = client_id_param;

        -- If client not found or has no pricing, return NULL
        IF NOT FOUND OR pricing_data.pricing_model IS NULL THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Calculate based on pricing model
    IF pricing_data.pricing_model = 'complimentary' THEN
        RETURN 0.00;

    ELSIF pricing_data.pricing_model = 'per_sample' THEN
        RETURN pricing_data.price_per_sample;

    ELSIF pricing_data.pricing_model = 'per_pound' THEN
        -- Calculate total pounds
        IF sample_data.bags_quantity_mt IS NOT NULL THEN
            -- 1 Metric Ton = 2204.62 pounds
            total_pounds := sample_data.bags_quantity_mt * 2204.62;
        ELSIF sample_data.bag_count IS NOT NULL AND sample_data.bag_weight_kg IS NOT NULL THEN
            -- Calculate from bag count × weight
            -- 1 kg = 2.20462 pounds
            total_pounds := (sample_data.bag_count * sample_data.bag_weight_kg) * 2.20462;
        ELSE
            -- No lot size data, return NULL
            RETURN NULL;
        END IF;

        -- Calculate fee (minimum 0.25¢/lb)
        cents_per_pound := GREATEST(pricing_data.price_per_pound_cents, 0.25);
        fee := total_pounds * (cents_per_pound / 100);

        RETURN ROUND(fee, 2);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Calculate lab fee for 3rd party labs
CREATE OR REPLACE FUNCTION calculate_lab_fee(
    laboratory_id_param UUID,
    sample_status_param sample_status
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    lab_config RECORD;
    lab_type_val lab_type;
BEGIN
    -- Check if this is a 3rd party lab
    SELECT type INTO lab_type_val
    FROM laboratories
    WHERE id = laboratory_id_param;

    -- If not a 3rd party lab, return NULL
    IF lab_type_val != 'third_party' THEN
        RETURN NULL;
    END IF;

    -- Get 3rd party lab config
    SELECT fee_per_sample, billing_basis, is_active
    INTO lab_config
    FROM laboratory_third_party_config
    WHERE laboratory_id = laboratory_id_param
      AND is_active = true;

    -- If no config or inactive, return NULL
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Check if we should charge based on billing_basis and sample status
    IF lab_config.billing_basis = 'all_samples' THEN
        RETURN lab_config.fee_per_sample;
    ELSIF lab_config.billing_basis = 'approved_only' AND sample_status_param = 'approved' THEN
        RETURN lab_config.fee_per_sample;
    ELSIF lab_config.billing_basis = 'approved_and_rejected'
          AND sample_status_param IN ('approved', 'rejected') THEN
        RETURN lab_config.fee_per_sample;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_client_fee(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_lab_fee(UUID, sample_status) TO authenticated;

-- Comments
COMMENT ON FUNCTION calculate_client_fee(UUID, UUID) IS 'Calculate fee to charge client - checks origin-specific pricing first, falls back to default client pricing';
COMMENT ON FUNCTION calculate_lab_fee(UUID, sample_status) IS 'Calculate fee owed to 3rd party lab based on sample status and lab billing basis';
