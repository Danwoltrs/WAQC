-- Migration: Fix tracking number generation for old-format configs
--
-- Problem: Clients with old-format tracking_number_format (no 'type' or 'pattern' field)
-- or null tracking_number_format cause the generate_tracking_number function to return NULL,
-- which JavaScript converts to the literal string "null".
--
-- Affected clients found:
--   - Dunkin Donuts: has_origin_code=true, has_quality_code=true but no pattern
--   - CAPAL: has_origin_code=false, has_quality_code=false but no pattern
--   - MINASUL: null tracking_number_format
--   - Comexim Ltda.: null tracking_number_format
--
-- Solution:
--   1. Update generate_tracking_number to handle old-format configs by auto-building patterns
--   2. Fix existing samples with "null" tracking numbers
--   3. Migrate all old-format configs to new format

-- Step 1: Drop and recreate the function with comprehensive fallback handling
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
    v_lab_specific_start INT;
    v_has_origin_code BOOLEAN;
    v_has_quality_code BOOLEAN;
    v_origin_position TEXT;
    v_quality_position TEXT;
BEGIN
    -- Get client's tracking number format (handle null client_id)
    IF p_client_id IS NOT NULL THEN
        SELECT tracking_number_format INTO v_format
        FROM clients
        WHERE id = p_client_id;
    END IF;

    -- Handle NULL or missing format - use simple default
    IF v_format IS NULL THEN
        v_format := '{"type": "standard", "pattern": "[5N]-[YY]", "separator": "-", "starting_sequence": 1, "sequence_padding": 5, "year_separator": "-"}'::jsonb;
        RAISE NOTICE 'Client % has NULL tracking_number_format, using default pattern', p_client_id;
    END IF;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);
    v_year_separator := COALESCE(v_format->>'year_separator', '-');

    -- CRITICAL: Handle old-format configs that have has_origin_code/has_quality_code
    -- but no type/pattern fields
    IF v_pattern IS NULL OR v_pattern = '' THEN
        -- Extract old-format flags
        v_has_origin_code := COALESCE((v_format->>'has_origin_code')::boolean, false);
        v_has_quality_code := COALESCE((v_format->>'has_quality_code')::boolean, false);
        v_origin_position := COALESCE(v_format->>'origin_position', 'prefix');
        v_quality_position := COALESCE(v_format->>'quality_position', 'prefix');

        -- Build pattern dynamically from old-format flags
        IF v_has_origin_code AND v_has_quality_code THEN
            -- Both origin and quality code
            IF v_origin_position = 'prefix' AND v_quality_position = 'suffix' THEN
                v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[QC]/[YY]';
                v_type := 'country_based';
            ELSIF v_quality_position = 'prefix' AND v_origin_position = 'suffix' THEN
                v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[C]/[YY]';
                v_type := 'quality_based';
            ELSE
                v_pattern := '[C]' || v_separator || '[QC]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[YY]';
                v_type := 'country_based';
            END IF;
        ELSIF v_has_origin_code THEN
            -- Only origin code
            v_type := 'country_based';
            v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[YY]';
        ELSIF v_has_quality_code THEN
            -- Only quality code
            v_type := 'quality_based';
            v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[YY]';
        ELSE
            -- Neither - simple sequential pattern
            v_type := 'standard';
            v_pattern := '[' || v_sequence_padding || 'N]' || v_separator || '[YY]';
        END IF;

        RAISE NOTICE 'Client % has old-format config, generated pattern: % (type: %)', p_client_id, v_pattern, v_type;
    END IF;

    -- Final fallback if pattern is still null (shouldn't happen but be safe)
    IF v_pattern IS NULL THEN
        v_type := 'standard';
        v_pattern := '[5N]-[YY]';
        RAISE WARNING 'Pattern still NULL for client %, using ultimate fallback: %', p_client_id, v_pattern;
    END IF;

    -- Check for lab-specific starting sequence (overrides global)
    IF p_laboratory_id IS NOT NULL THEN
        SELECT starting_sequence INTO v_lab_specific_start
        FROM client_laboratory_config
        WHERE client_id = p_client_id
          AND laboratory_id = p_laboratory_id;

        -- Use lab-specific starting sequence if it exists
        IF v_lab_specific_start IS NOT NULL THEN
            v_starting_sequence := v_lab_specific_start;
        END IF;
    END IF;

    -- For type samples, get lab prefix
    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT type_sample_prefix INTO v_lab_prefix
        FROM laboratories
        WHERE id = p_laboratory_id;
    END IF;

    -- Get next sequence number for this client AND laboratory (continuous across years)
    -- Uses lab-specific starting_sequence if configured, otherwise uses global starting_sequence
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id = p_client_id
      AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id)
      AND tracking_number IS NOT NULL
      AND tracking_number != 'null'  -- Exclude incorrectly stored null strings
      AND tracking_number ~ '\d+';   -- Only consider valid tracking numbers with digits

    -- If no valid sequence found, use starting_sequence
    IF v_sequence IS NULL THEN
        v_sequence := v_starting_sequence;
    END IF;

    -- Get 2-digit year
    v_year := TO_CHAR(NOW(), 'YY');

    -- Build tracking number based on type
    IF v_type = 'country_based' THEN
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(COALESCE(p_origin, 'XX') FROM 1 FOR 2));
        END IF;

        -- Also get quality code if pattern includes it
        IF v_pattern LIKE '%[QC]%' THEN
            SELECT UPPER(quality_code) INTO v_quality_code
            FROM client_qualities
            WHERE id = p_quality_template_id;
            v_quality_code := COALESCE(v_quality_code, 'QC');
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[QC]', COALESCE(v_quality_code, 'QC'));
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        -- Look up quality_code from client_qualities
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        -- Also get country code if pattern includes it
        IF v_pattern LIKE '%[C]%' THEN
            SELECT country_code INTO v_country_code
            FROM country_codes
            WHERE country_name ILIKE p_origin
            LIMIT 1;
            IF v_country_code IS NULL THEN
                v_country_code := UPPER(SUBSTRING(COALESCE(p_origin, 'XX') FROM 1 FOR 2));
            END IF;
        END IF;

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[C]', COALESCE(v_country_code, 'XX'));
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        -- Standard type
        v_tracking_number := REPLACE(v_pattern, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);
    END IF;

    -- Prepend lab prefix for type samples (if configured)
    IF v_lab_prefix IS NOT NULL THEN
        v_tracking_number := v_lab_prefix || v_tracking_number;
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    -- CRITICAL: Final safety check - never return null
    IF v_tracking_number IS NULL OR v_tracking_number = '' THEN
        v_tracking_number := 'ERR-' || LPAD(v_sequence::TEXT, 6, '0') || '-' || v_year;
        RAISE WARNING 'Tracking number generation failed for client %, using error fallback: %', p_client_id, v_tracking_number;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with comprehensive fallback handling. Supports both new-format (type/pattern) and old-format (has_origin_code/has_quality_code) configs. Never returns NULL - uses fallback patterns if needed.';

-- Step 2: Migrate old-format configs to new format for future consistency
-- Update Dunkin Donuts (has_origin_code=true, has_quality_code=true)
UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', 'country_based',
    'pattern', '[C]-[6N]-[QC]/[YY]',
    'separator', '-',
    'year_format', 'YY',
    'year_separator', '/',
    'has_origin_code', true,
    'origin_position', 'prefix',
    'has_quality_code', true,
    'quality_position', 'suffix',
    'sequence_padding', 6,
    'starting_sequence', 1
)
WHERE company = 'Dunkin Donuts'
  AND (tracking_number_format->>'pattern') IS NULL;

-- Update CAPAL (has_origin_code=false, has_quality_code=false)
UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', 'standard',
    'pattern', '[6N]-[YY]',
    'separator', '-',
    'year_format', 'YY',
    'year_separator', '-',
    'has_origin_code', false,
    'has_quality_code', false,
    'sequence_padding', 6,
    'starting_sequence', 1
)
WHERE company = 'CAPAL'
  AND (tracking_number_format->>'pattern') IS NULL;

-- Set default format for clients with NULL tracking_number_format
UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', 'standard',
    'pattern', '[6N]-[YY]',
    'separator', '-',
    'year_format', 'YY',
    'year_separator', '-',
    'has_origin_code', false,
    'has_quality_code', false,
    'sequence_padding', 6,
    'starting_sequence', 1
)
WHERE tracking_number_format IS NULL;

-- Step 3: Fix samples with "null" tracking number by regenerating them
-- First, let's identify affected samples
DO $$
DECLARE
    r RECORD;
    v_new_tracking TEXT;
BEGIN
    RAISE NOTICE 'Fixing samples with "null" tracking number...';

    FOR r IN
        SELECT s.id, s.client_id, s.laboratory_id, s.origin, s.quality_spec_id, s.sample_type, c.company
        FROM samples s
        LEFT JOIN clients c ON c.id = s.client_id
        WHERE s.tracking_number = 'null'
           OR s.tracking_number IS NULL
    LOOP
        -- Generate new tracking number
        v_new_tracking := generate_tracking_number(
            r.client_id,
            r.laboratory_id,
            r.origin,
            r.quality_spec_id,
            false,
            COALESCE(r.sample_type::text, 'pss')
        );

        -- Update the sample
        UPDATE samples
        SET tracking_number = v_new_tracking
        WHERE id = r.id;

        RAISE NOTICE 'Fixed sample % for client %: null -> %', r.id, COALESCE(r.company, 'Unknown'), v_new_tracking;
    END LOOP;
END;
$$;

-- Also fix any certificates that reference samples with null certificate_number
UPDATE certificates c
SET certificate_number = s.tracking_number
FROM samples s
WHERE c.sample_id = s.id
  AND (c.certificate_number = 'null' OR c.certificate_number IS NULL)
  AND s.tracking_number IS NOT NULL
  AND s.tracking_number != 'null';

-- Verification query
DO $$
DECLARE
    v_null_samples INT;
    v_null_certs INT;
BEGIN
    SELECT COUNT(*) INTO v_null_samples
    FROM samples
    WHERE tracking_number = 'null' OR tracking_number IS NULL;

    SELECT COUNT(*) INTO v_null_certs
    FROM certificates
    WHERE certificate_number = 'null' OR certificate_number IS NULL;

    RAISE NOTICE '';
    RAISE NOTICE 'Migration 128 completed:';
    RAISE NOTICE '  - Updated generate_tracking_number() with comprehensive fallback handling';
    RAISE NOTICE '  - Migrated old-format client configs to new format';
    RAISE NOTICE '  - Remaining samples with null tracking: %', v_null_samples;
    RAISE NOTICE '  - Remaining certificates with null number: %', v_null_certs;

    IF v_null_samples > 0 OR v_null_certs > 0 THEN
        RAISE WARNING 'Some records still have null values - manual intervention may be required';
    END IF;
END;
$$;

SELECT 'Migration 128: Fixed tracking number generation for old-format configs' as status;
