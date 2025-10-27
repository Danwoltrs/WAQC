-- Migration: Fix type sample tracking number generation for quality-based clients
--
-- Problem: For quality-based clients (like Blaser), when creating a type sample without
-- a quality_spec_id, the tracking number defaults to including 'QC' (e.g., WA-QC-008902/25)
-- because the quality code lookup fails and defaults to 'QC'.
--
-- Solution: For type samples, skip quality-based pattern logic and use a simple
-- lab-prefix + sequence + year format regardless of the client's normal tracking format.
--
-- Example:
--   Before: WA-QC-008902/25 (has unwanted 'QC')
--   After:  WA-008902/25 (clean type sample format)

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
    -- Get client's tracking number format
    SELECT tracking_number_format INTO v_format
    FROM clients
    WHERE id = p_client_id;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);
    v_year_separator := COALESCE(v_format->>'year_separator', '-');

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
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id = p_client_id
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
        v_tracking_number := REPLACE(v_pattern, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with per-laboratory sequence and type sample support. Type samples use simplified format: LAB_PREFIX + SEQUENCE/YY (e.g., WA-00001/25), ignoring client-specific patterns to ensure consistency across all type samples.';

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Migration 077 completed successfully';
    RAISE NOTICE 'Type samples now use simplified format regardless of client tracking pattern';
    RAISE NOTICE 'Example: WA-00001/25 instead of WA-QC-00001/25';
END;
$$;

SELECT 'Migration 077: Fixed type sample tracking for quality-based clients' as status;
