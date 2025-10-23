-- Migration: Fix tracking number generation to use quality_code from client_qualities

-- The issue: generate_tracking_number was looking up quality code from quality_templates
-- using the client_qualities ID, which always failed and fell back to 'QC'
--
-- The fix: Look up quality_code from client_qualities table instead

DROP FUNCTION IF EXISTS generate_tracking_number(UUID, UUID, TEXT, UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION generate_tracking_number(
    p_client_id UUID,
    p_laboratory_id UUID DEFAULT NULL,
    p_origin TEXT DEFAULT NULL,
    p_quality_template_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false,
    p_sample_type TEXT DEFAULT 'pss'
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
    v_lab_prefix TEXT;
BEGIN
    -- Get client's tracking number format
    SELECT tracking_number_format INTO v_format
    FROM clients
    WHERE id = p_client_id;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');

    -- For type samples, get lab prefix
    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT type_sample_prefix INTO v_lab_prefix
        FROM laboratories
        WHERE id = p_laboratory_id;
    END IF;

    -- Get next sequence number for this client
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id = p_client_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

    -- Get 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- Build tracking number based on type
    IF v_type = 'country_based' THEN
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(p_origin FROM 1 FOR 1));
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        -- FIXED: Look up quality_code from client_qualities instead of quality_templates
        -- The p_quality_template_id parameter actually contains a client_qualities.id
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        v_tracking_number := REPLACE(v_pattern, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);
    END IF;

    -- Prepend lab prefix for type samples
    IF v_lab_prefix IS NOT NULL THEN
        v_tracking_number := v_lab_prefix || v_tracking_number;
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with support for quality-based, country-based, and sequential formats. Fixed to use quality_code from client_qualities table. Quality codes like AD (Alfenas Dulce) are used instead of generic QC.';

-- Test the fix
DO $$
DECLARE
    v_blaser_id UUID := '7d5306ac-1118-4c94-999b-e05becc68c64';
    v_quality_id UUID;
    v_test_tracking TEXT;
BEGIN
    -- Get Blaser's Alfenas Dulce quality spec
    SELECT id INTO v_quality_id
    FROM client_qualities
    WHERE client_id = v_blaser_id
    AND custom_name ILIKE '%alfenas%'
    LIMIT 1;

    IF v_quality_id IS NOT NULL THEN
        -- Test tracking number generation
        SELECT generate_tracking_number(
            v_blaser_id,
            NULL,
            'Brazil',
            v_quality_id,
            false,
            'pss'
        ) INTO v_test_tracking;

        RAISE NOTICE 'Migration 063 completed successfully';
        RAISE NOTICE 'Test tracking number: % (expected: AD-00001-25 or AD-00002-25)', v_test_tracking;

        IF v_test_tracking NOT LIKE 'AD-%' THEN
            RAISE EXCEPTION 'Migration 063 verification failed: Expected AD- prefix, got %', v_test_tracking;
        END IF;
    ELSE
        RAISE NOTICE 'Migration 063 completed (no Blaser quality spec found for testing)';
    END IF;
END;
$$;

SELECT 'Migration 063: Fixed tracking number quality code lookup to use client_qualities table' as status;
