-- Migration: Add type_sample_sequence_start to laboratories and fix year separator format
--
-- Changes:
-- 1. Add type_sample_sequence_start field to laboratories table
-- 2. Update generate_tracking_number to use /yy format instead of --yy for type samples
-- 3. Support lab-specific sequence starting numbers for type samples
--
-- Example formats:
--   Before: WA-00001--25 (double dash)
--   After:  WA-00001/25 (forward slash)

-- Add type_sample_sequence_start column to laboratories
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS type_sample_sequence_start INTEGER DEFAULT 1;

COMMENT ON COLUMN laboratories.type_sample_sequence_start IS 'Starting sequence number for type samples at this laboratory. Defaults to 1. The sequence continues from the highest existing number or this starting value, whichever is greater.';

-- Update generate_tracking_number function
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
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit

        -- For type samples, always use / separator for year
        IF p_sample_type = 'type' THEN
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', '/' || v_year);
        ELSE
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
        END IF;

    ELSIF v_type = 'quality_based' THEN
        -- Look up quality_code from client_qualities instead of quality_templates
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit

        -- For type samples, always use / separator for year
        IF p_sample_type = 'type' THEN
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', '/' || v_year);
        ELSE
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
        END IF;

    ELSE
        v_tracking_number := REPLACE(v_pattern, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit

        -- For type samples, always use / separator for year
        IF p_sample_type = 'type' THEN
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', '/' || v_year);
        ELSE
            v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
        END IF;
    END IF;

    -- Prepend lab prefix for type samples (if configured)
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

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with per-laboratory sequence and type sample support. Type samples use /yy format (e.g., WA-00001/25) and support lab-specific starting sequence numbers.';

-- Set default starting sequences for existing labs (optional)
UPDATE laboratories
SET type_sample_sequence_start = 1
WHERE type_sample_sequence_start IS NULL;

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Migration 076 completed successfully';
    RAISE NOTICE 'Added type_sample_sequence_start field to laboratories';
    RAISE NOTICE 'Type sample format now uses / instead of -- for year (e.g., WA-00001/25)';
    RAISE NOTICE 'Each lab can configure its own type sample sequence starting number';
END;
$$;

SELECT 'Migration 076: Added type sample sequence start and fixed year separator format' as status;
