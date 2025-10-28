-- Migration: Fix type sample sequence calculation to ignore client_id
--
-- Problem: Type samples are using the buyer's sequence counter instead of the lab's
-- sequence counter when a client_id is provided. This causes type samples to get
-- numbers like WA-045890/25 (from Blaser's counter) instead of WA-00001/25 (lab counter).
--
-- Example of the issue:
--   - Type sample for Blaser: WA-045890/25 (uses Blaser's sequence ❌)
--   - PSS sample for Blaser: BD-045891/25 (uses Blaser's sequence ✅)
--
-- Root cause: The sequence calculation uses client_id for ALL sample types.
-- For type samples, we want to:
--   1. Store client_id in the sample record (to track who received it)
--   2. BUT ignore client_id when calculating sequence (always use lab sequence)
--
-- Solution: For type samples, force client_id to NULL in the sequence calculation
-- query, even if p_client_id is provided.

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
    v_client_id_for_sequence UUID;
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

    -- CRITICAL FIX: For type samples, always use NULL client_id for sequence calculation
    -- This ensures type samples use the lab's sequence counter, not the buyer's counter
    -- Even though the sample record will store the client_id (to track who received it)
    IF p_sample_type = 'type' THEN
        v_client_id_for_sequence := NULL;
    ELSE
        v_client_id_for_sequence := p_client_id;
    END IF;

    -- Get next sequence number for this client AND laboratory (continuous across years)
    -- For type samples: v_client_id_for_sequence is NULL, so it uses lab sequence
    -- For PSS/SS samples: v_client_id_for_sequence is the buyer, so it uses buyer sequence
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id IS NOT DISTINCT FROM v_client_id_for_sequence
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
COMMENT ON FUNCTION generate_tracking_number IS 'Generate unique tracking numbers for samples with proper NULL handling for client_id. For type samples, always uses lab sequence (client_id NULL) even if client_id is provided for tracking purposes. Supports country-based, quality-based, and type sample formats with lab-specific prefixes and sequences.';

SELECT 'Migration 080: Fixed type sample sequence to always use lab sequence (client_id NULL) regardless of provided client_id' as status;
