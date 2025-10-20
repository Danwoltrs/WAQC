

-- ========================================
-- CREATE HELPER FUNCTIONS
-- ========================================

-- Drop existing generate_tracking_number function (from migration 004)
-- The new version has a different signature and enhanced functionality
DROP FUNCTION IF EXISTS generate_tracking_number(UUID, UUID, TEXT);

-- Function to generate tracking number based on client format
CREATE OR REPLACE FUNCTION generate_tracking_number(
    p_client_id UUID,
    p_origin TEXT,
    p_quality_template_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false
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
        -- Get country code from origin
        SELECT country_code INTO v_country_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        -- Default to first letter of origin if no mapping found
        IF v_country_code IS NULL THEN
            v_country_code := UPPER(SUBSTRING(p_origin FROM 1 FOR 1));
        END IF;

        -- Replace placeholders: [C]-[5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[C]', v_country_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSIF v_type = 'quality_based' THEN
        -- Get quality code from template (first 2 letters of template name)
        SELECT UPPER(SUBSTRING(name_en FROM 1 FOR 2)) INTO v_quality_code
        FROM quality_templates
        WHERE id = p_quality_template_id;

        -- Default to 'QC' if no template
        v_quality_code := COALESCE(v_quality_code, 'QC');

        -- Replace placeholders: [QC]-[5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[QC]', v_quality_code);
        v_tracking_number := REPLACE(v_tracking_number, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);

    ELSE
        -- Standard format: [5N]-[YY]
        v_tracking_number := REPLACE(v_pattern, '[5N]', LPAD(v_sequence::TEXT, 5, '0'));
        v_tracking_number := REPLACE(v_tracking_number, '[YY]', v_year);
    END IF;

    -- Add rejected suffix if applicable
    IF p_is_rejected THEN
        v_tracking_number := v_tracking_number || v_rejected_suffix;
    END IF;

    RETURN v_tracking_number;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS 'Generate tracking number based on client-specific format configuration';

-- Function to get certificate suffix for a client quality
CREATE OR REPLACE FUNCTION get_certificate_quality_name(
    p_client_quality_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_custom_name TEXT;
    v_suffix TEXT;
    v_uses_suffix BOOLEAN;
    v_result TEXT;
BEGIN
    -- Get quality details
    SELECT
        COALESCE(custom_name, get_quality_template_name(template_id, 'EN')),
        certificate_suffix,
        uses_certificate_suffix
    INTO v_custom_name, v_suffix, v_uses_suffix
    FROM client_qualities
    WHERE id = p_client_quality_id;

    -- Build result
    v_result := v_custom_name;

    IF v_uses_suffix AND v_suffix IS NOT NULL AND v_suffix != '' THEN
        v_result := v_result || ' ' || v_suffix;
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_certificate_quality_name IS 'Get full quality name for certificate including suffix if enabled';

-- ========================================
-- ADD INDEXES
-- ========================================

-- Index for certificate suffix lookups
CREATE INDEX IF NOT EXISTS idx_client_qualities_certificate_suffix
ON client_qualities(uses_certificate_suffix) WHERE uses_certificate_suffix = true;

-- Index for client tracking format lookups
CREATE INDEX IF NOT EXISTS idx_clients_tracking_format
ON clients USING GIN (tracking_number_format);

-- ========================================
-- ADD COMMENTS
-- ========================================

COMMENT ON COLUMN client_qualities.certificate_suffix IS 'Optional suffix appended to quality name on certificates (e.g., "Premium Grade", "2024 Harvest")';
COMMENT ON COLUMN client_qualities.uses_certificate_suffix IS 'Whether to append certificate_suffix to quality name on certificates';
COMMENT ON COLUMN clients.tracking_number_format IS 'JSONB configuration for tracking number generation pattern (type: standard/country_based/quality_based, pattern with placeholders)';
COMMENT ON COLUMN clients.certificate_config IS 'JSONB configuration for certificate generation (enabled, logo, footer, signature settings)';
COMMENT ON TABLE country_codes IS 'Mapping of country names to single-letter codes for tracking number generation';

-- ========================================
-- UPDATE RLS POLICIES FOR COUNTRY_CODES
-- ========================================

ALTER TABLE country_codes ENABLE ROW LEVEL SECURITY;

-- Everyone can view country codes
CREATE POLICY "Anyone can view country codes" ON country_codes
    FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "Only admins can modify country codes" ON country_codes
    FOR ALL USING (
        get_user_qc_role(auth.uid()) IN ('global_admin', 'global_quality_admin')
    );

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check client_qualities columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_qualities' AND column_name = 'certificate_suffix'
    ) THEN
        RAISE EXCEPTION 'Migration 047 verification failed: certificate_suffix column not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_qualities' AND column_name = 'uses_certificate_suffix'
    ) THEN
        RAISE EXCEPTION 'Migration 047 verification failed: uses_certificate_suffix column not created';
    END IF;

    -- Check clients columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'tracking_number_format'
    ) THEN
        RAISE EXCEPTION 'Migration 047 verification failed: tracking_number_format column not created';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'certificate_config'
    ) THEN
        RAISE EXCEPTION 'Migration 047 verification failed: certificate_config column not created';
    END IF;

    -- Check country_codes table
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'country_codes'
    ) THEN
        RAISE EXCEPTION 'Migration 047 verification failed: country_codes table not created';
    END IF;

    -- Check that default country codes were inserted
    IF (SELECT COUNT(*) FROM country_codes) < 9 THEN
        RAISE EXCEPTION 'Migration 047 verification failed: default country codes not inserted';
    END IF;

    RAISE NOTICE 'Migration 047 completed successfully: Added certificate and tracking number configuration';
END;
$$;

SELECT 'Migration 047: Added certificate generation and tracking number configuration' as status;
