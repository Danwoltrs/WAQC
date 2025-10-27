-- Migration: Fix type sample sequence generation for samples without client_id
--
-- Problem: When creating type samples without a client_id (p_client_id IS NULL),
-- the WHERE clause "WHERE client_id = p_client_id" evaluates to "WHERE client_id = NULL"
-- which always returns FALSE in SQL. This causes the sequence to always start from
-- v_starting_sequence, resulting in duplicate tracking numbers.
--
-- Solution: Use proper NULL handling with "IS NOT DISTINCT FROM" or separate logic
-- for NULL vs non-NULL client_id cases.

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
    v_starting_sequence INT;
    v_sequence_padding INT;
    v_year_separator TEXT;
    v_type_sample_sequence_start INT;
BEGIN
    -- Get client's tracking number format (if client_id provided)
    IF p_client_id IS NOT NULL THEN
        SELECT tracking_number_format INTO v_format
        FROM clients
        WHERE id = p_client_id;
    ELSE
        -- Default format for samples without client
        v_format := '{
            "type": "simple",
            "pattern": "[5N]/[YY]",
            "separator": "-",
            "starting_sequence": 1,
            "sequence_padding": 5,
            "year_separator": "/",
            "rejected_suffix": "-R"
        }'::JSONB;
    END IF;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);
    v_year_separator := COALESCE(v_format->>'year_separator', '/');

    -- For type samples, get lab prefix and sequence start
    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT
            type_sample_prefix,
            COALESCE(type_sample_sequence_start, 1)
        INTO
            v_lab_prefix,
            v_type_sample_sequence_start
        FROM laboratories
        WHERE id = p_laboratory_id;

        -- Override starting sequence for type samples
        v_starting_sequence := v_type_sample_sequence_start;
    END IF;

    -- Get next sequence number for this client AND laboratory (continuous across years)
    -- Handle NULL client_id properly using IS NOT DISTINCT FROM
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id IS NOT DISTINCT FROM p_client_id
      AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id);

    -- Get 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- FOR TYPE SAMPLES: Use simple format (prefix + sequence + year) regardless of client format
    IF p_sample_type = 'type' THEN
        -- Build simple tracking number: [LAB_PREFIX]SEQUENCE/YY
        v_tracking_number := LPAD(v_sequence::TEXT, v_sequence_padding, '0') || '/' || v_year;

        -- Prepend lab prefix if configured
        IF v_lab_prefix IS NOT NULL THEN
            v_tracking_number := v_lab_prefix || v_tracking_number;
        END IF;

    -- FOR REGULAR SAMPLES: Use client's configured format
    ELSIF v_type = 'country_based' THEN
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(p_origin FROM 1 FOR 1));
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);

    ELSIF v_type = 'quality_based' THEN
        -- Look up quality_code from client_qualities
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);

    ELSE
        -- Default simple format
        v_tracking_number := LPAD(v_sequence::TEXT, v_sequence_padding, '0') || '/' || v_year;
    END IF;

    -- Add rejected suffix if needed
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION generate_tracking_number IS 'Generate unique tracking numbers for samples with proper NULL handling for client_id. Supports country-based, quality-based, and type sample formats with lab-specific prefixes and sequences.';
