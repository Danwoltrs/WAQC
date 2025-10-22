-- Migration 051: Create certificate number generation function
-- This function generates certificate numbers based on client-specific patterns
-- with support for quality codes, origin codes, custom sequences, and year formats

-- ========================================
-- HELPER FUNCTION FOR CERTIFICATE NUMBER GENERATION
-- ========================================

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_spec_id UUID DEFAULT NULL
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
            'separator', '-'
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

    -- Build certificate number
    IF v_prefix != '' THEN
        v_result := v_prefix || v_separator;
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

COMMENT ON FUNCTION generate_certificate_number IS 'Generate certificate number based on client pattern configuration. Supports quality code prefix/suffix, origin code prefix/suffix, custom sequence padding, and year formatting. Uses existing certificate count + starting_sequence for proper sequence tracking. Example outputs: AD-050653/25, 050654-BR/25, QC-050655-CO/2025';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_test_number TEXT;
    v_blaser_id UUID;
    v_blaser_quality_id UUID;
BEGIN
    -- Get Blaser's client ID
    SELECT id INTO v_blaser_id
    FROM clients
    WHERE company = 'Blaser Trading AG'
    LIMIT 1;

    -- Get one of Blaser's quality specifications
    SELECT id INTO v_blaser_quality_id
    FROM client_qualities
    WHERE client_id = v_blaser_id
    LIMIT 1;

    IF v_blaser_id IS NOT NULL AND v_blaser_quality_id IS NOT NULL THEN
        -- Test certificate number generation
        SELECT generate_certificate_number(
            v_blaser_id,
            'Brazil',
            v_blaser_quality_id
        ) INTO v_test_number;

        RAISE NOTICE 'Migration 051 completed successfully';
        RAISE NOTICE 'Test certificate number for Blaser: %', v_test_number;
        RAISE NOTICE 'Expected format: AD-050653/25 (quality code + sequence + year)';
    ELSE
        RAISE NOTICE 'Migration 051 completed - function created (no test data available)';
    END IF;

    -- Check function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'generate_certificate_number'
    ) THEN
        RAISE EXCEPTION 'Migration 051 verification failed: generate_certificate_number function not created';
    END IF;
END;
$$;

SELECT 'Migration 051: Created certificate number generation function' as status;
