-- Migration: Fix tracking number uniqueness - per client, not global
--
-- BUG 1: The UNIQUE constraint on tracking_number is GLOBAL, but tracking
-- numbers are generated per-client. Multiple clients with the same format
-- (e.g., Floriana, Pazar, Coffein all use "[6N]/[YY]") collide because
-- 000001/26 can only exist once globally.
--
-- BUG 2: The generate_tracking_number() function runs as SECURITY INVOKER,
-- so RLS hides soft-deleted samples. MAX(seq_num) skips them, generating
-- duplicates that collide with the UNIQUE constraint.
--
-- FIX 1: Replace the global UNIQUE constraint with a composite unique on
-- (client_id, tracking_number). Each client has their own namespace.
-- FIX 2: SECURITY DEFINER so the function bypasses RLS (sees soft-deleted rows).

-- ========================================
-- 1. Replace global unique with per-client unique
-- ========================================

-- Drop the old global unique constraint
ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_tracking_number_key;

-- Drop the old index (created in 001_initial_schema.sql)
DROP INDEX IF EXISTS idx_samples_tracking_number;

-- Create composite unique: same tracking number is fine for different clients
CREATE UNIQUE INDEX idx_samples_tracking_number_per_client
    ON samples (client_id, tracking_number);

-- Keep a non-unique index for lookups by tracking_number alone
CREATE INDEX idx_samples_tracking_number_lookup
    ON samples (tracking_number);

-- ========================================
-- 2. Recreate generate_tracking_number with SECURITY DEFINER
-- ========================================

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
SECURITY DEFINER
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
        v_format := '{"type": "standard", "pattern": "[5N]/[YY]", "separator": "-", "starting_sequence": 1, "sequence_padding": 5}'::jsonb;
        RAISE NOTICE 'Client % has NULL tracking_number_format, using default pattern', p_client_id;
    END IF;

    -- Extract format components
    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);

    -- CRITICAL: Handle old-format configs that have has_origin_code/has_quality_code
    -- but no type/pattern fields. Always use /[YY] for year separator.
    IF v_pattern IS NULL OR v_pattern = '' THEN
        v_has_origin_code := COALESCE((v_format->>'has_origin_code')::boolean, false);
        v_has_quality_code := COALESCE((v_format->>'has_quality_code')::boolean, false);
        v_origin_position := COALESCE(v_format->>'origin_position', 'prefix');
        v_quality_position := COALESCE(v_format->>'quality_position', 'prefix');

        IF v_has_origin_code AND v_has_quality_code THEN
            IF v_origin_position = 'prefix' AND v_quality_position = 'suffix' THEN
                v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[QC]/[YY]';
                v_type := 'country_based';
            ELSIF v_quality_position = 'prefix' AND v_origin_position = 'suffix' THEN
                v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]' || v_separator || '[C]/[YY]';
                v_type := 'quality_based';
            ELSE
                v_pattern := '[C]' || v_separator || '[QC]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
                v_type := 'country_based';
            END IF;
        ELSIF v_has_origin_code THEN
            v_type := 'country_based';
            v_pattern := '[C]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
        ELSIF v_has_quality_code THEN
            v_type := 'quality_based';
            v_pattern := '[QC]' || v_separator || '[' || v_sequence_padding || 'N]/[YY]';
        ELSE
            v_type := 'standard';
            v_pattern := '[' || v_sequence_padding || 'N]/[YY]';
        END IF;

        RAISE NOTICE 'Client % has old-format config, generated pattern: % (type: %)', p_client_id, v_pattern, v_type;
    END IF;

    -- Final fallback if pattern is still null
    IF v_pattern IS NULL THEN
        v_type := 'standard';
        v_pattern := '[5N]/[YY]';
        RAISE WARNING 'Pattern still NULL for client %, using ultimate fallback: %', p_client_id, v_pattern;
    END IF;

    -- Check for lab-specific starting sequence
    IF p_laboratory_id IS NOT NULL THEN
        SELECT starting_sequence INTO v_lab_specific_start
        FROM client_laboratory_config
        WHERE client_id = p_client_id
          AND laboratory_id = p_laboratory_id;

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

    -- Get next sequence number (continuous across years, per client + per lab)
    -- Sequence is shared across ALL quality prefixes for the same client + lab.
    -- Uses '(\d+)/' regex to extract the sequence number (digits before the slash).
    -- This correctly handles prefixes with digits (e.g., "AD1-890239/26" -> 890239).
    -- Also checks sample_contracts to avoid gaps/duplicates with sub-contract numbers.
    -- NOTE: Because this function is SECURITY DEFINER, it sees ALL rows including
    -- soft-deleted samples, preventing duplicate tracking number collisions.
    SELECT COALESCE(MAX(seq_num), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM (
        SELECT CAST(SUBSTRING(tracking_number FROM '(\d+)/') AS INTEGER) AS seq_num
        FROM samples
        WHERE client_id = p_client_id
          AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id)
          AND tracking_number IS NOT NULL
          AND tracking_number != 'null'
          AND tracking_number ~ '\d+/'
        UNION ALL
        SELECT CAST(SUBSTRING(sc.tracking_number FROM '(\d+)/') AS INTEGER) AS seq_num
        FROM sample_contracts sc
        JOIN samples s ON sc.sample_id = s.id
        WHERE s.client_id = p_client_id
          AND (p_laboratory_id IS NULL OR s.laboratory_id = p_laboratory_id)
          AND sc.tracking_number IS NOT NULL
          AND sc.tracking_number != 'null'
          AND sc.tracking_number ~ '\d+/'
    ) combined
    WHERE seq_num IS NOT NULL;

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
        SELECT UPPER(quality_code) INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

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

    -- Prepend lab prefix for type samples
    IF v_lab_prefix IS NOT NULL THEN
        v_tracking_number := v_lab_prefix || v_tracking_number;
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    -- Final safety check
    IF v_tracking_number IS NULL OR v_tracking_number = '' THEN
        v_tracking_number := 'ERR-' || LPAD(v_sequence::TEXT, 6, '0') || '/' || v_year;
        RAISE WARNING 'Tracking number generation failed for client %, using error fallback: %', p_client_id, v_tracking_number;
    END IF;

    RETURN v_tracking_number;
END;
$$;

-- Restrict execute to authenticated users only (defense in depth)
REVOKE ALL ON FUNCTION generate_tracking_number(UUID, UUID, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_tracking_number(UUID, UUID, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number. SECURITY DEFINER to bypass RLS and see soft-deleted samples. Uses (\d+)/ regex to correctly extract sequence from digit-containing prefixes. Checks both samples and sample_contracts tables. Sequence is per client + per lab, shared across all quality prefixes.';
