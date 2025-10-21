-- Migration 049: Add Quality Code to Client Qualities
-- Date: 2025-10-21
-- Purpose: Add quality_code and code_position fields for client-specific quality naming with codes

-- ========================================
-- ADD QUALITY CODE FIELDS
-- ========================================

-- Add quality code field for client-specific quality codes (e.g., "AD" for "Alfenas Dulce")
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS quality_code TEXT;

-- Add code position field (prefix or suffix)
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS code_position TEXT DEFAULT 'suffix' CHECK (code_position IN ('prefix', 'suffix'));

-- ========================================
-- ADD CONSTRAINTS
-- ========================================

-- Ensure one template per client (active assignments only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_qualities_unique_template_per_client
ON client_qualities(client_id, template_id)
WHERE is_active = true;

-- Ensure unique quality codes per client (when code is provided)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_qualities_unique_code_per_client
ON client_qualities(client_id, quality_code)
WHERE quality_code IS NOT NULL AND quality_code != '' AND is_active = true;

-- ========================================
-- CREATE INDEXES FOR PERFORMANCE
-- ========================================

-- Index for filtering by quality code
CREATE INDEX IF NOT EXISTS idx_client_qualities_quality_code
ON client_qualities(quality_code)
WHERE quality_code IS NOT NULL;

-- ========================================
-- ADD COMMENTS
-- ========================================

COMMENT ON COLUMN client_qualities.quality_code IS 'Client-specific quality code for certificate numbering (e.g., "AD" for Alfenas Dulce). Must be unique per client.';
COMMENT ON COLUMN client_qualities.code_position IS 'Position of quality code in certificate numbering: prefix or suffix';

-- ========================================
-- UPDATE DISPLAY NAME FUNCTION
-- ========================================

-- Enhanced function to include quality code in display name for internal use
CREATE OR REPLACE FUNCTION get_client_quality_display_name_with_code(
    p_client_quality_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_custom_name TEXT;
    v_quality_code TEXT;
    v_code_position TEXT;
    v_template_id UUID;
    v_display_name TEXT;
BEGIN
    -- Get custom name, code, position and template_id from client_qualities
    SELECT custom_name, quality_code, code_position, template_id
    INTO v_custom_name, v_quality_code, v_code_position, v_template_id
    FROM client_qualities
    WHERE id = p_client_quality_id;

    -- Start with custom name or template name
    IF v_custom_name IS NOT NULL AND v_custom_name != '' THEN
        v_display_name := v_custom_name;
    ELSE
        v_display_name := get_quality_template_name(v_template_id, p_language);
    END IF;

    -- Apply quality code if exists (for internal display only)
    IF v_quality_code IS NOT NULL AND v_quality_code != '' THEN
        IF v_code_position = 'prefix' THEN
            v_display_name := v_quality_code || ' - ' || v_display_name;
        ELSE -- suffix is default
            v_display_name := v_display_name || ' - ' || v_quality_code;
        END IF;
    END IF;

    RETURN v_display_name;
END;
$$;

COMMENT ON FUNCTION get_client_quality_display_name_with_code IS 'Get display name with quality code for internal use (custom name + code). For certificates, use get_client_quality_display_name instead.';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check that quality_code column was added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_qualities'
        AND column_name = 'quality_code'
    ) THEN
        RAISE EXCEPTION 'Migration 049 verification failed: quality_code column not created';
    END IF;

    -- Check that code_position column was added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_qualities'
        AND column_name = 'code_position'
    ) THEN
        RAISE EXCEPTION 'Migration 049 verification failed: code_position column not created';
    END IF;

    -- Check that unique constraint index was created
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'client_qualities'
        AND indexname = 'idx_client_qualities_unique_template_per_client'
    ) THEN
        RAISE EXCEPTION 'Migration 049 verification failed: unique template per client index not created';
    END IF;

    RAISE NOTICE 'Migration 049 completed successfully: Added quality_code fields to client_qualities';
END;
$$;

SELECT 'Migration 049: Added quality_code and code_position to client_qualities' as status;
