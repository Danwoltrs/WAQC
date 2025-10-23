-- Migration: Add type sample prefix to laboratories and hide_exporter option to samples

-- Add type_sample_prefix to laboratories
ALTER TABLE laboratories
ADD COLUMN IF NOT EXISTS type_sample_prefix TEXT DEFAULT NULL;

COMMENT ON COLUMN laboratories.type_sample_prefix IS 'Prefix for type samples at this laboratory (e.g., "WA-" for Santos). Used in tracking number generation.';

-- Add hide_exporter_on_label to samples
ALTER TABLE samples
ADD COLUMN IF NOT EXISTS hide_exporter_on_label BOOLEAN DEFAULT false;

COMMENT ON COLUMN samples.hide_exporter_on_label IS 'Whether to hide exporter name on printed labels (typically used for type samples)';

-- Update Santos HQ with WA- prefix
UPDATE laboratories
SET type_sample_prefix = 'WA-'
WHERE name = 'Santos HQ'
  OR (city = 'Santos' AND country = 'Brazil' AND type = 'headquarters');

-- Update generate_tracking_number to support lab prefix for type samples
DROP FUNCTION IF EXISTS generate_tracking_number(UUID, TEXT, UUID, BOOLEAN);

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

    -- For type samples, get lab prefix
    IF p_sample_type = 'type' AND p_laboratory_id IS NOT NULL THEN
        SELECT type_sample_prefix INTO v_lab_prefix
        FROM laboratories
        WHERE id = p_laboratory_id;
    END IF;

    -- Get next sequence number for this client
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id = p_client_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

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
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        SELECT UPPER(SUBSTRING(name_en FROM 1 FOR 2)) INTO v_quality_code
        FROM quality_templates
        WHERE id = p_quality_template_id;

        v_quality_code := COALESCE(v_quality_code, 'QC');

        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        v_tracking_number := REPLACE(v_pattern, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
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

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with support for lab-specific type sample prefixes. Type samples use lab prefix (e.g., WA-00001-25 for Santos).';

DO $$
DECLARE
    v_santos_prefix TEXT;
BEGIN
    SELECT type_sample_prefix INTO v_santos_prefix
    FROM laboratories
    WHERE name = 'Santos HQ'
    LIMIT 1;

    IF v_santos_prefix IS NULL OR v_santos_prefix != 'WA-' THEN
        RAISE EXCEPTION 'Migration 061 verification failed: Santos HQ type_sample_prefix not set correctly';
    END IF;

    RAISE NOTICE 'Migration 061 completed successfully: Added type sample prefix support';
    RAISE NOTICE 'Santos HQ prefix: %', v_santos_prefix;
END;
$$;

SELECT 'Migration 061: Added type sample prefix and hide_exporter_on_label support' as status;
