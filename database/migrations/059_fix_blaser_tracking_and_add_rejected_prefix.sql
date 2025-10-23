-- Migration: Fix all clients' malformed tracking number format and add rejected certificate prefix

-- ========================================
-- FIX ALL CLIENTS' MALFORMED TRACKING NUMBER FORMAT
-- ========================================

-- Fix all clients where pattern is an object instead of a string
-- This handles the malformed nested pattern structure
UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', tracking_number_format->>'type',
    'pattern', tracking_number_format->'pattern'->>'pattern',
    'separator', COALESCE(tracking_number_format->'pattern'->>'separator', tracking_number_format->>'separator', '-'),
    'rejected_suffix', COALESCE(tracking_number_format->>'rejected_suffix', '-R')
)
WHERE tracking_number_format IS NOT NULL
  AND jsonb_typeof(tracking_number_format->'pattern') = 'object';

-- ========================================
-- UPDATE CERTIFICATE NUMBER GENERATION FOR REJECTED SAMPLES
-- ========================================

-- Add rejected_prefix to certificate_pattern for all clients that don't have it
UPDATE clients
SET certificate_pattern =
    CASE
        WHEN certificate_pattern IS NOT NULL THEN
            certificate_pattern || jsonb_build_object('rejected_prefix', 'R-')
        ELSE
            jsonb_build_object('rejected_prefix', 'R-')
    END
WHERE certificate_pattern IS NULL
   OR NOT certificate_pattern ? 'rejected_prefix';

-- ========================================
-- UPDATE GENERATE_CERTIFICATE_NUMBER FUNCTION
-- ========================================

-- Drop the old 3-parameter version
DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_spec_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_pattern JSONB;
    v_has_quality BOOLEAN;
    v_quality_position TEXT;
    v_has_origin BOOLEAN;
    v_origin_position TEXT;
    v_padding INT;
    v_starting_seq INT;
    v_year_format TEXT;
    v_separator TEXT;
    v_rejected_prefix TEXT;
    v_sequence INT;
    v_year TEXT;
    v_quality_code TEXT;
    v_origin_code TEXT;
    v_result TEXT := '';
    v_prefix TEXT := '';
    v_suffix TEXT := '';
BEGIN
    -- Get client's certificate pattern
    SELECT certificate_pattern INTO v_pattern
    FROM clients
    WHERE id = p_client_id;

    -- If no pattern, use default
    IF v_pattern IS NULL THEN
        v_pattern := jsonb_build_object(
            'has_quality_code', false,
            'quality_position', 'prefix',
            'has_origin_code', false,
            'origin_position', 'prefix',
            'sequence_padding', 6,
            'starting_sequence', 1,
            'year_format', 'YY',
            'separator', '-',
            'rejected_prefix', 'R-'
        );
    END IF;

    -- Extract configuration
    v_has_quality := COALESCE((v_pattern->>'has_quality_code')::boolean, false);
    v_quality_position := COALESCE(v_pattern->>'quality_position', 'prefix');
    v_has_origin := COALESCE((v_pattern->>'has_origin_code')::boolean, false);
    v_origin_position := COALESCE(v_pattern->>'origin_position', 'prefix');
    v_padding := COALESCE((v_pattern->>'sequence_padding')::int, 6);
    v_starting_seq := COALESCE((v_pattern->>'starting_sequence')::int, 1);
    v_year_format := COALESCE(v_pattern->>'year_format', 'YY');
    v_separator := COALESCE(v_pattern->>'separator', '-');
    v_rejected_prefix := COALESCE(v_pattern->>'rejected_prefix', 'R-');

    -- Get next sequence number for this client
    -- Count existing certificates for this client this year and add starting_sequence
    SELECT COALESCE(COUNT(*), 0) + v_starting_seq
    INTO v_sequence
    FROM certificates c
    INNER JOIN samples s ON c.sample_id = s.id
    WHERE s.client_id = p_client_id
    AND EXTRACT(YEAR FROM c.created_at) = EXTRACT(YEAR FROM NOW());

    -- Format year
    IF v_year_format = 'YYYY' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
    ELSE
        v_year := TO_CHAR(NOW(), 'YY');
    END IF;

    -- Get quality code if needed (use quality_code field from client_qualities)
    IF v_has_quality AND p_quality_spec_id IS NOT NULL THEN
        SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2), 'QC'))
        INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_spec_id
        LIMIT 1;

        v_quality_code := COALESCE(v_quality_code, 'QC');
    END IF;

    -- Get origin code if needed (first 2 letters of origin, uppercase)
    IF v_has_origin AND p_origin IS NOT NULL THEN
        -- Try to get from country_codes table first
        SELECT country_code INTO v_origin_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        -- Fallback to first 2 letters
        v_origin_code := COALESCE(v_origin_code, UPPER(SUBSTRING(p_origin FROM 1 FOR 2)));
    END IF;

    -- Build prefix
    IF v_has_quality AND v_quality_position = 'prefix' THEN
        v_prefix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'prefix' THEN
        v_prefix := v_origin_code;
    END IF;

    -- Build suffix
    IF v_has_quality AND v_quality_position = 'suffix' THEN
        v_suffix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'suffix' THEN
        v_suffix := v_origin_code;
    END IF;

    -- Add rejected prefix if sample is rejected
    IF p_is_rejected THEN
        v_result := v_rejected_prefix;
    END IF;

    -- Build certificate number
    IF v_prefix != '' THEN
        v_result := v_result || v_prefix || v_separator;
    END IF;

    v_result := v_result || LPAD(v_sequence::TEXT, v_padding, '0');

    IF v_suffix != '' THEN
        v_result := v_result || v_separator || v_suffix;
    END IF;

    -- Always append year at the end with /
    v_result := v_result || '/' || v_year;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION generate_certificate_number IS 'Generate certificate number based on client pattern configuration. Supports rejected prefix (R-), quality code prefix/suffix, origin code prefix/suffix, custom sequence padding, and year formatting. Example outputs: AD-050653/25, R-AD-050654/25 (rejected), 050655-BR/25, QC-050656-CO/2025';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_blaser_format JSONB;
    v_test_normal TEXT;
    v_test_rejected TEXT;
    v_blaser_id UUID := '7d5306ac-1118-4c94-999b-e05becc68c64';
    v_quality_id UUID;
BEGIN
    -- Check Blaser's format was fixed
    SELECT tracking_number_format INTO v_blaser_format
    FROM clients
    WHERE id = v_blaser_id;

    IF v_blaser_format->>'pattern' IS NULL OR
       v_blaser_format->'pattern' IS NOT NULL AND jsonb_typeof(v_blaser_format->'pattern') = 'object' THEN
        RAISE EXCEPTION 'Migration 059 verification failed: Blaser tracking format still malformed';
    END IF;

    -- Get one of Blaser's quality specifications
    SELECT id INTO v_quality_id
    FROM client_qualities
    WHERE client_id = v_blaser_id
    LIMIT 1;

    IF v_quality_id IS NOT NULL THEN
        -- Test certificate number generation (normal)
        SELECT generate_certificate_number(
            v_blaser_id,
            'Brazil',
            v_quality_id,
            false
        ) INTO v_test_normal;

        -- Test certificate number generation (rejected)
        SELECT generate_certificate_number(
            v_blaser_id,
            'Brazil',
            v_quality_id,
            true
        ) INTO v_test_rejected;

        RAISE NOTICE 'Migration 059 completed successfully';
        RAISE NOTICE 'Normal certificate: % (expected format: AD-050653/25)', v_test_normal;
        RAISE NOTICE 'Rejected certificate: % (expected format: R-AD-050653/25)', v_test_rejected;
    END IF;
END;
$$;

SELECT 'Migration 059: Fixed Blaser tracking format and added rejected certificate prefix' as status;
