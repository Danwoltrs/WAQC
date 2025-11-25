-- Migration 110: Convert all OLD format tracking numbers to NEW format
-- Date: 2025-11-25
-- Purpose: Permanent fix to convert legacy tracking_number_format to new pattern-based format
--          This ensures ALL clients work seamlessly with generate_tracking_number()
--          NOTE: Exporters should NOT have tracking patterns (they don't receive certificates)

-- Step 1: Remove tracking patterns from ALL exporters (they don't receive certificates)
UPDATE clients
SET
  tracking_number_format = NULL,
  certificate_pattern = NULL
WHERE 'exporter' = ANY(client_types)
  AND (tracking_number_format IS NOT NULL OR certificate_pattern IS NOT NULL);

-- Step 2: Update Ahold (has_quality_code=true, quality_position=prefix, no origin)
-- Pattern should be: [QC]-[6N][YY] → Example: AD-048522/25
UPDATE clients
SET tracking_number_format = jsonb_build_object(
  'type', 'quality_based',
  'pattern', '[QC]-[6N][YY]',
  'separator', '-',
  'year_separator', '/',
  'starting_sequence', COALESCE((tracking_number_format->>'starting_sequence')::int, 1),
  'sequence_padding', COALESCE((tracking_number_format->>'sequence_padding')::int, 6)
)
WHERE fantasy_name = 'Ahold'
  AND NOT (tracking_number_format ? 'type')
  AND NOT ('exporter' = ANY(client_types));

-- Step 3: Create a generic function for future clients to auto-convert OLD to NEW format
CREATE OR REPLACE FUNCTION convert_legacy_tracking_format(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_format JSONB;
    v_cert_pattern JSONB;
    v_pattern TEXT := '';
    v_type TEXT;
    v_has_origin BOOLEAN;
    v_has_quality BOOLEAN;
    v_origin_pos TEXT;
    v_quality_pos TEXT;
    v_padding INT;
    v_starting_seq INT;
    v_separator TEXT;
    v_year_sep TEXT;
BEGIN
    -- Get current formats
    SELECT tracking_number_format, certificate_pattern
    INTO v_old_format, v_cert_pattern
    FROM clients
    WHERE id = p_client_id;

    -- If already new format, return as-is
    IF v_old_format ? 'type' THEN
        RETURN v_old_format;
    END IF;

    -- Extract settings from certificate_pattern (fallback to tracking_number_format)
    v_has_origin := COALESCE((v_cert_pattern->>'has_origin_code')::boolean, (v_old_format->>'has_origin_code')::boolean, false);
    v_has_quality := COALESCE((v_cert_pattern->>'has_quality_code')::boolean, (v_old_format->>'has_quality_code')::boolean, false);
    v_origin_pos := COALESCE(v_cert_pattern->>'origin_position', v_old_format->>'origin_position', 'prefix');
    v_quality_pos := COALESCE(v_cert_pattern->>'quality_position', v_old_format->>'quality_position', 'prefix');
    v_padding := COALESCE((v_cert_pattern->>'sequence_padding')::int, (v_old_format->>'sequence_padding')::int, 6);
    v_starting_seq := COALESCE((v_old_format->>'starting_sequence')::int, 1);
    v_separator := COALESCE(v_old_format->>'separator', '-');
    v_year_sep := '/';

    -- Determine type
    IF v_has_quality AND v_has_origin THEN
        v_type := 'quality_based'; -- Can use both
    ELSIF v_has_quality THEN
        v_type := 'quality_based';
    ELSIF v_has_origin THEN
        v_type := 'country_based';
    ELSE
        v_type := 'simple';
    END IF;

    -- Build pattern based on configuration
    -- Prefix elements (origin and/or quality if prefix position)
    IF v_has_origin AND v_origin_pos = 'prefix' THEN
        v_pattern := v_pattern || '[C]' || v_separator;
    END IF;

    IF v_has_quality AND v_quality_pos = 'prefix' THEN
        v_pattern := v_pattern || '[QC]' || v_separator;
    END IF;

    -- Sequence number (always present)
    v_pattern := v_pattern || '[' || v_padding || 'N]';

    -- Suffix elements (origin and/or quality if suffix position)
    IF v_has_origin AND v_origin_pos = 'suffix' THEN
        v_pattern := v_pattern || v_separator || '[C]';
    END IF;

    IF v_has_quality AND v_quality_pos = 'suffix' THEN
        v_pattern := v_pattern || v_separator || '[QC]';
    END IF;

    -- Year (always at the end)
    v_pattern := v_pattern || '[YY]';

    -- Return new format
    RETURN jsonb_build_object(
        'type', v_type,
        'pattern', v_pattern,
        'separator', v_separator,
        'year_separator', v_year_sep,
        'starting_sequence', v_starting_seq,
        'sequence_padding', v_padding
    );
END;
$$;

COMMENT ON FUNCTION convert_legacy_tracking_format IS 'Converts legacy tracking_number_format (with boolean flags) to new pattern-based format. Can be called on-demand for any client that still has OLD format.';

-- Verification query
SELECT
    'Migration 110 completed' as status,
    COUNT(*) FILTER (WHERE 'exporter' = ANY(client_types) AND tracking_number_format IS NULL) as exporters_without_patterns,
    COUNT(*) FILTER (WHERE NOT ('exporter' = ANY(client_types)) AND tracking_number_format ? 'type') as buyers_with_new_format,
    COUNT(*) FILTER (WHERE NOT ('exporter' = ANY(client_types)) AND tracking_number_format IS NOT NULL AND NOT (tracking_number_format ? 'type')) as buyers_with_old_format,
    array_agg(fantasy_name) FILTER (WHERE NOT ('exporter' = ANY(client_types)) AND tracking_number_format IS NOT NULL AND NOT (tracking_number_format ? 'type')) as buyers_needing_conversion
FROM clients;
