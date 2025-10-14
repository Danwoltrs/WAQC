-- Migration 029: Create Fee Calculation Triggers
-- Date: 2025-10-14
-- Purpose: Automatically calculate and cache fees when samples are created or updated

-- Trigger function to auto-calculate fees when sample is created or status changes
CREATE OR REPLACE FUNCTION update_sample_fees()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate client fee (always calculated)
    NEW.calculated_client_fee := calculate_client_fee(NEW.client_id, NEW.id);

    -- Calculate lab fee (only for 3rd party labs based on status)
    NEW.calculated_lab_fee := calculate_lab_fee(NEW.laboratory_id, NEW.status);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT operations
CREATE TRIGGER trigger_calculate_sample_fees_insert
    BEFORE INSERT ON samples
    FOR EACH ROW
    EXECUTE FUNCTION update_sample_fees();

-- Create trigger for UPDATE operations when relevant fields change
CREATE TRIGGER trigger_calculate_sample_fees_update
    BEFORE UPDATE OF status, client_id, laboratory_id, origin, bags_quantity_mt, bag_count, bag_weight_kg
    ON samples
    FOR EACH ROW
    WHEN (
        OLD.status IS DISTINCT FROM NEW.status OR
        OLD.client_id IS DISTINCT FROM NEW.client_id OR
        OLD.laboratory_id IS DISTINCT FROM NEW.laboratory_id OR
        OLD.origin IS DISTINCT FROM NEW.origin OR
        OLD.bags_quantity_mt IS DISTINCT FROM NEW.bags_quantity_mt OR
        OLD.bag_count IS DISTINCT FROM NEW.bag_count OR
        OLD.bag_weight_kg IS DISTINCT FROM NEW.bag_weight_kg
    )
    EXECUTE FUNCTION update_sample_fees();

-- Trigger to recalculate fees when client pricing changes
CREATE OR REPLACE FUNCTION recalculate_client_sample_fees()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate fees for all samples of this client
    UPDATE samples
    SET calculated_client_fee = calculate_client_fee(NEW.client_id, id)
    WHERE client_id = NEW.client_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger when client default pricing changes
CREATE TRIGGER trigger_recalculate_on_client_pricing_change
    AFTER UPDATE OF pricing_model, price_per_sample, price_per_pound_cents
    ON clients
    FOR EACH ROW
    WHEN (
        OLD.pricing_model IS DISTINCT FROM NEW.pricing_model OR
        OLD.price_per_sample IS DISTINCT FROM NEW.price_per_sample OR
        OLD.price_per_pound_cents IS DISTINCT FROM NEW.price_per_pound_cents
    )
    EXECUTE FUNCTION recalculate_client_sample_fees();

-- Trigger when origin-specific pricing changes
CREATE OR REPLACE FUNCTION recalculate_origin_sample_fees()
RETURNS TRIGGER AS $$
BEGIN
    -- Determine client_id and origin to update
    IF TG_OP = 'DELETE' THEN
        -- Recalculate fees for samples with this client and origin
        UPDATE samples
        SET calculated_client_fee = calculate_client_fee(OLD.client_id, id)
        WHERE client_id = OLD.client_id
          AND origin = OLD.origin;
        RETURN OLD;
    ELSE
        -- INSERT or UPDATE
        UPDATE samples
        SET calculated_client_fee = calculate_client_fee(NEW.client_id, id)
        WHERE client_id = NEW.client_id
          AND origin = NEW.origin;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_on_origin_pricing_change
    AFTER INSERT OR UPDATE OR DELETE
    ON client_origin_pricing
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_origin_sample_fees();

-- Trigger when lab config changes
CREATE OR REPLACE FUNCTION recalculate_lab_sample_fees()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate fees for all samples of this lab
    UPDATE samples
    SET calculated_lab_fee = calculate_lab_fee(NEW.laboratory_id, status)
    WHERE laboratory_id = NEW.laboratory_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recalculate_on_lab_config_change
    AFTER UPDATE OF fee_per_sample, billing_basis
    ON laboratory_third_party_config
    FOR EACH ROW
    WHEN (
        OLD.fee_per_sample IS DISTINCT FROM NEW.fee_per_sample OR
        OLD.billing_basis IS DISTINCT FROM NEW.billing_basis
    )
    EXECUTE FUNCTION recalculate_lab_sample_fees();

-- Comments
COMMENT ON FUNCTION update_sample_fees() IS 'Trigger function to automatically calculate and cache sample fees';
COMMENT ON FUNCTION recalculate_client_sample_fees() IS 'Recalculate all sample fees when client pricing changes';
COMMENT ON FUNCTION recalculate_origin_sample_fees() IS 'Recalculate sample fees when origin-specific pricing changes';
COMMENT ON FUNCTION recalculate_lab_sample_fees() IS 'Recalculate lab fees when 3rd party lab config changes';
