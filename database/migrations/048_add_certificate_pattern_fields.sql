-- ========================================
-- Migration 048: Add Certificate Pattern Configuration Fields
-- ========================================
-- Adds fields to clients table for configurable certificate numbering patterns
-- including prefix/suffix options, quality codes, origin codes, and starting sequences

-- ========================================
-- ALTER CLIENTS TABLE
-- ========================================

ALTER TABLE clients
    -- Convert tracking_number_format from TEXT to JSONB for richer configuration
    ALTER COLUMN tracking_number_format TYPE JSONB USING
        CASE
            WHEN tracking_number_format IS NULL THEN NULL
            ELSE jsonb_build_object(
                'type', 'standard',
                'pattern', tracking_number_format,
                'separator', '-'
            )
        END,

    -- Add certificate pattern configuration
    ADD COLUMN IF NOT EXISTS certificate_pattern JSONB DEFAULT jsonb_build_object(
        'has_quality_code', false,
        'quality_position', 'prefix',
        'has_origin_code', false,
        'origin_position', 'prefix',
        'sequence_padding', 6,
        'starting_sequence', 1,
        'year_format', 'YY',
        'separator', '-'
    ),

    -- Add certificate configuration if not exists (from migration 047)
    ADD COLUMN IF NOT EXISTS certificate_config JSONB DEFAULT jsonb_build_object(
        'enabled', true,
        'include_logo', true,
        'include_signature', true
    );

-- ========================================
-- ADD COMMENTS
-- ========================================

COMMENT ON COLUMN clients.certificate_pattern IS 'Configuration for certificate numbering pattern:
- has_quality_code: boolean - include quality specification code
- quality_position: prefix|suffix - where to place quality code
- has_origin_code: boolean - include origin country code
- origin_position: prefix|suffix - where to place origin code (must be opposite of quality if both enabled)
- sequence_padding: number - how many digits to pad sequence number (e.g., 6 = 000001)
- starting_sequence: number - starting number for sequence
- year_format: YY|YYYY - year format
- separator: string - separator character (default: "-")
Example: AD-000123/25 (quality code AD, sequence 000123, year 25)';

COMMENT ON COLUMN clients.tracking_number_format IS 'JSONB configuration for tracking number generation:
- type: standard|country_based|quality_based
- pattern: pattern string with placeholders [C], [QC], [5N], [YY]
- separator: separator character
- rejected_suffix: suffix for rejected samples (e.g., "-R")';

COMMENT ON COLUMN clients.certificate_config IS 'General certificate generation settings:
- enabled: boolean - whether to generate certificates
- include_logo: boolean - include company logo
- include_signature: boolean - include digital signature';

-- ========================================
-- CREATE INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_clients_certificate_pattern
ON clients USING GIN (certificate_pattern);

-- ========================================
-- UPDATE EXISTING DATA
-- ========================================

-- Update existing NULL certificate_pattern to default
UPDATE clients
SET certificate_pattern = jsonb_build_object(
    'has_quality_code', false,
    'quality_position', 'prefix',
    'has_origin_code', false,
    'origin_position', 'prefix',
    'sequence_padding', 6,
    'starting_sequence', 1,
    'year_format', 'YY',
    'separator', '-'
)
WHERE certificate_pattern IS NULL;

-- Update existing NULL certificate_config to default
UPDATE clients
SET certificate_config = jsonb_build_object(
    'enabled', true,
    'include_logo', true,
    'include_signature', true
)
WHERE certificate_config IS NULL;

-- ========================================
-- HELPER FUNCTION FOR CERTIFICATE NUMBER GENERATION
-- ========================================

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_template_id UUID DEFAULT NULL
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

    -- Get next sequence number for this client (starting from configured starting_sequence)
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(
        REGEXP_REPLACE(tracking_number, '[^0-9]', '', 'g'),
        '^0+', ''
    ) AS INTEGER)), v_starting_seq - 1) + 1
    INTO v_sequence
    FROM samples
    WHERE client_id = p_client_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

    -- Format year
    IF v_year_format = 'YYYY' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
    ELSE
        v_year := TO_CHAR(NOW(), 'YY');
    END IF;

    -- Get quality code if needed (first 2 letters of quality name, uppercase)
    IF v_has_quality AND p_quality_template_id IS NOT NULL THEN
        SELECT UPPER(SUBSTRING(COALESCE(custom_name, name_en) FROM 1 FOR 2))
        INTO v_quality_code
        FROM client_qualities cq
        LEFT JOIN quality_templates qt ON cq.template_id = qt.id
        WHERE cq.id = p_quality_template_id
        LIMIT 1;

        v_quality_code := COALESCE(v_quality_code, 'QC');
    END IF;

    -- Get origin code if needed (first 2 letters of origin, uppercase)
    IF v_has_origin AND p_origin IS NOT NULL THEN
        -- Try to get from country_codes table first
        SELECT code INTO v_origin_code
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

COMMENT ON FUNCTION generate_certificate_number IS 'Generate certificate number based on client pattern configuration. Supports quality code prefix/suffix, origin code prefix/suffix, custom sequence padding, and year formatting. Example outputs: AD-000123/25, 000456-BR/25, QC-000789-CO/2025';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check certificate_pattern column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'certificate_pattern'
    ) THEN
        RAISE EXCEPTION 'Migration 048 verification failed: certificate_pattern column not created';
    END IF;

    -- Check certificate_config column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'certificate_config'
    ) THEN
        RAISE EXCEPTION 'Migration 048 verification failed: certificate_config column not created';
    END IF;

    -- Check tracking_number_format is JSONB
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients'
        AND column_name = 'tracking_number_format'
        AND data_type = 'jsonb'
    ) THEN
        RAISE EXCEPTION 'Migration 048 verification failed: tracking_number_format not converted to JSONB';
    END IF;

    -- Check function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'generate_certificate_number'
    ) THEN
        RAISE EXCEPTION 'Migration 048 verification failed: generate_certificate_number function not created';
    END IF;

    RAISE NOTICE 'Migration 048 completed successfully: Added certificate pattern configuration fields';
END;
$$;

SELECT 'Migration 048: Added certificate pattern configuration to clients table' as status;
