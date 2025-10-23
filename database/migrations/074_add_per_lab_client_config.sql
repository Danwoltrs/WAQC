-- Migration: Add per-laboratory client configuration for custom starting sequences
--
-- Enables setting different starting sequences for the same client across different labs
-- Example:
--   - Blaser in Brazil (Santos): starting_sequence = 8900
--   - Blaser in Colombia: starting_sequence = 5000
--   - Blaser in Guatemala: starting_sequence = 2450

-- Create table for lab-specific client configurations
CREATE TABLE IF NOT EXISTS client_laboratory_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
    starting_sequence INT DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, laboratory_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_client_lab_config_client
ON client_laboratory_config(client_id);

CREATE INDEX IF NOT EXISTS idx_client_lab_config_laboratory
ON client_laboratory_config(laboratory_id);

-- Add RLS policies
ALTER TABLE client_laboratory_config ENABLE ROW LEVEL SECURITY;

-- Global admins can do everything
CREATE POLICY "Global admins can manage client lab configs"
ON client_laboratory_config
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.qc_role IN ('global_admin', 'global_quality_admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.qc_role IN ('global_admin', 'global_quality_admin')
    )
);

-- Lab personnel can view their own lab's configs
CREATE POLICY "Lab personnel can view their lab configs"
ON client_laboratory_config
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.laboratory_id = client_laboratory_config.laboratory_id
    )
);

COMMENT ON TABLE client_laboratory_config IS 'Lab-specific client configuration. Allows different starting sequences per laboratory for the same client.';
COMMENT ON COLUMN client_laboratory_config.starting_sequence IS 'Starting sequence number for this client at this specific laboratory. Overrides the global client starting_sequence.';

-- Update generate_tracking_number function to use lab-specific starting sequence
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
      AND (p_laboratory_id IS NULL OR laboratory_id = p_laboratory_id);
    -- Each lab now maintains its own sequence counter for each client

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
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);

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
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);

    ELSE
        v_tracking_number := REPLACE(v_pattern, '[' || v_sequence_padding || 'N]', LPAD(v_sequence::TEXT, v_sequence_padding, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0')); -- Fallback for old patterns
        v_tracking_number := REPLACE(v_tracking_number, '[6N]', LPAD(v_sequence::TEXT, 6, '0')); -- Fallback for 6-digit
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year_separator || v_year);
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

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number with per-laboratory sequence and lab-specific starting sequences. Checks client_laboratory_config for lab-specific starting_sequence first, falls back to client global starting_sequence. Each lab maintains its own continuous sequence counter for each client across all years.';

-- Test notification
DO $$
BEGIN
    RAISE NOTICE 'Migration 074 completed successfully';
    RAISE NOTICE '';
    RAISE NOTICE 'Created table: client_laboratory_config';
    RAISE NOTICE 'This allows setting different starting sequences per laboratory for each client.';
    RAISE NOTICE '';
    RAISE NOTICE 'Example usage:';
    RAISE NOTICE '  INSERT INTO client_laboratory_config (client_id, laboratory_id, starting_sequence)';
    RAISE NOTICE '  VALUES';
    RAISE NOTICE '    (''blaser-uuid'', ''santos-lab-uuid'', 8900),    -- Brazil starts at 8900';
    RAISE NOTICE '    (''blaser-uuid'', ''colombia-lab-uuid'', 5000),  -- Colombia starts at 5000';
    RAISE NOTICE '    (''blaser-uuid'', ''guatemala-lab-uuid'', 2450); -- Guatemala starts at 2450';
    RAISE NOTICE '';
    RAISE NOTICE 'Updated generate_tracking_number() to check lab-specific configs first.';
END;
$$;

SELECT 'Migration 074: Added per-laboratory client configuration for custom starting sequences' as status;
