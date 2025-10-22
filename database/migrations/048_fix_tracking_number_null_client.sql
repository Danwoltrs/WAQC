-- Migration 048: Fix generate_tracking_number to handle null client_id
-- This allows sample intake without a client (for spot samples, etc.)

-- Drop and recreate the function with null client handling
DROP FUNCTION IF EXISTS generate_tracking_number(UUID, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION generate_tracking_number(
    p_client_id UUID,
    p_origin TEXT,
    p_quality_template_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_format JSONB;
    v_pattern TEXT;
    v_type TEXT;
    v_separator TEXT;
    v_sequence INT;
    v_year TEXT;
    v_country_code TEXT;
    v_quality_code TEXT;
    v_tracking_number TEXT;
    v_rejected_suffix TEXT;
BEGIN
    -- Get client's tracking number format (if client exists)
    IF p_client_id IS NOT NULL THEN
        SELECT tracking_number_format INTO v_format
        FROM clients
        WHERE id = p_client_id;
    END IF;

    -- Use default format if no client or client has no format
    IF v_format IS NULL THEN
        v_format := jsonb_build_object(
            'type', 'standard',
            'pattern', '[5N]-[YY]',
            'separator', '-',
            'rejected_suffix', '-R'
        );
    END IF;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');

    -- Get next sequence number
    -- If client_id is null, use global sequence; otherwise use client-specific sequence
    IF p_client_id IS NULL THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), 0) + 1
        INTO v_sequence
        FROM samples
        WHERE client_id IS NULL
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
    ELSE
        SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), 0) + 1
        INTO v_sequence
        FROM samples
        WHERE client_id = p_client_id
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
    END IF;

    -- Default to 1 if no sequence found
    v_sequence := COALESCE(v_sequence, 1);

    -- Get 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- Build tracking number based on type
    IF v_type = 'country_based' THEN
        -- Get country code from origin
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        -- Default to first letter of origin if no mapping found
        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(p_origin FROM 1 FOR 1));
        END IF;

        -- Replace placeholders: [C]-[5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        -- Get quality code from template (first 2 letters of template name)
        SELECT UPPER(SUBSTRING(name_en FROM 1 FOR 2)) INTO v_quality_code
        FROM quality_templates
        WHERE id = p_quality_template_id;

        -- Default to 'QC' if no template
        v_quality_code := COALESCE(v_quality_code, 'QC');

        -- Replace placeholders: [QC]-[5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        -- Standard format: [5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number based on client-specific format configuration. Supports null client_id for spot samples.';

-- Verification
DO $$
DECLARE
    v_test_tracking TEXT;
BEGIN
    -- Test with null client_id
    SELECT generate_tracking_number(NULL, 'Brazil', NULL, false) INTO v_test_tracking;

    IF v_test_tracking IS NULL OR v_test_tracking = '' THEN
        RAISE EXCEPTION 'Migration 048 verification failed: generate_tracking_number returned null for null client_id';
    END IF;

    RAISE NOTICE 'Migration 048 completed successfully: Fixed tracking number generation for null client_id';
    RAISE NOTICE 'Test tracking number generated: %', v_test_tracking;
END;
$$;

SELECT 'Migration 048: Fixed tracking number generation for null client_id' as status;
