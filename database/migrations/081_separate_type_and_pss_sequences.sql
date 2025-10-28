-- Migration: Separate type sample and PSS/SS sequence counters
--
-- Problem: Type samples and PSS/SS samples were sharing the same sequence counter
-- when they had the same client_id. This caused:
--   - Type sample for Blaser: WA-045890/25 (lab sequence, client_id = Blaser for tracking)
--   - PSS sample for Blaser: BD-045891/25 (should be BD-008900/25 from Blaser's starting sequence)
--
-- The PSS sample found the type sample in the MAX(sequence) query because both had
-- client_id = Blaser, even though type samples should use lab sequence independent
-- of client sequence.
--
-- Solution: Add sample_type filter to sequence calculation. This ensures:
--   - Type samples only count other type samples (lab sequence)
--   - PSS/SS samples only count other PSS/SS samples (client sequence)
--   - They never interfere with each other's counters

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
    IF p_client_id IS NOT NULL THEN
        SELECT tracking_number_format INTO v_format FROM clients WHERE id = p_client_id;
    ELSE
        v_format := '{"type": "simple", "pattern": "[5N]/[YY]", "separator": "-", "starting_sequence": 1, "sequence_padding": 5, "year_separator": "/", "rejected_suffix": "-R"}'::JSONB;
    END IF;

    v_type := v_format->>'type';
    v_pattern := v_format->>'pattern';
    v_separator := COALESCE(v_format->>'separator', '-');
    v_rejected_suffix := COALESCE(v_format->>'rejected_suffix', '-R');
    v_starting_sequence := COALESCE((v_format->>'starting_sequence')::int, 1);
    v_sequence_padding := COALESCE((v_format->>'sequence_padding')::int, 5);
    v_year_separator := COALESCE(v_format->>'year_separator', '/');

    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT type_sample_prefix, COALESCE(type_sample_sequence_start, 1)
        INTO v_lab_prefix, v_type_sample_sequence_start
        FROM laboratories WHERE id = p_laboratory_id;
        v_starting_sequence := v_type_sample_sequence_start;
    END IF;

    -- For type samples, use NULL client_id for sequence calculation (lab sequence)
    -- For PSS/SS samples, use actual client_id (client sequence)
    IF p_sample_type = 'type' THEN
        v_client_id_for_sequence := NULL;
    ELSE
        v_client_id_for_sequence := p_client_id;
    END IF;

    -- CRITICAL FIX: Add sample_type filter to prevent cross-contamination of sequences
    -- Type samples use lab sequence, PSS/SS use client sequence - keep them separate
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), v_starting_sequence - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id IS NOT DISTINCT FROM v_client_id_for_sequence
      AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id)
      AND sample_type = p_sample_type;  -- NEW: Only count samples of the same type

    v_year := TO_CHAR(NOW(), 'YY');

    IF p_sample_type = 'type' THEN
        v_tracking_number := LPAD(v_sequence::TEXT, v_sequence_padding, '0') || '/' || v_year;
        IF v_lab_prefix IS NOT NULL THEN
            v_tracking_number := v_lab_prefix || v_tracking_number;
        END IF;
    ELSIF v_type = 'country_based' THEN
        SELECT country_code INTO v_country_code FROM country_codes WHERE country_name ILIKE p_origin LIMIT 1;
        IF v_country_code IS NULL THEN v_country_code := UPPER(SUBSTRING(p_origin FROM 1 FOR 1)); END IF;
        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
    ELSIF v_type = 'quality_based' THEN
        SELECT UPPER(quality_code) INTO v_quality_code FROM client_qualities WHERE id = p_quality_template_id;
        v_quality_code := COALESCE(v_quality_code, 'QC');
        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
    ELSE
        v_tracking_number := LPAD(v_sequence::TEXT, v_sequence_padding, '0') || '/' || v_year;
    END IF;

    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate unique tracking numbers with separate sequence counters for type samples (lab sequence) and PSS/SS samples (client sequence). Type samples and PSS/SS samples never share sequence counters even if they have the same client_id.';

SELECT 'Migration 081: Separated type sample and PSS/SS sequence counters with sample_type filter' as status;
