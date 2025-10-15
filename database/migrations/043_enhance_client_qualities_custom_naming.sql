-- Migration 043: Enhance Client Qualities with Custom Naming
-- Date: 2025-10-15
-- Purpose: Add custom naming fields to allow clients to give their own names to quality templates

-- ========================================
-- ADD CUSTOM NAMING FIELDS
-- ========================================

-- Add custom name field for client-specific quality names
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- Add is_active flag to enable/disable specific client-quality assignments
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add notes field for internal tracking
ALTER TABLE client_qualities
ADD COLUMN IF NOT EXISTS notes TEXT;

-- ========================================
-- CREATE INDEXES FOR PERFORMANCE
-- ========================================

-- Index for client_id lookups (frequently queried)
CREATE INDEX IF NOT EXISTS idx_client_qualities_client_id ON client_qualities(client_id);

-- Index for template_id lookups
CREATE INDEX IF NOT EXISTS idx_client_qualities_template_id ON client_qualities(template_id);

-- Index for active quality specs
CREATE INDEX IF NOT EXISTS idx_client_qualities_active ON client_qualities(is_active) WHERE is_active = true;

-- Composite index for client + active queries
CREATE INDEX IF NOT EXISTS idx_client_qualities_client_active ON client_qualities(client_id, is_active) WHERE is_active = true;

-- ========================================
-- ADD COMMENTS
-- ========================================

COMMENT ON COLUMN client_qualities.custom_name IS 'Client-specific name for this quality specification (e.g., "Starbucks Natural Brazil 2024")';
COMMENT ON COLUMN client_qualities.is_active IS 'Whether this client-quality assignment is currently active';
COMMENT ON COLUMN client_qualities.notes IS 'Internal notes about this client-quality assignment';
COMMENT ON COLUMN client_qualities.origin IS 'Origin filter for this quality spec (optional, can be NULL for templates applying to all origins)';
COMMENT ON COLUMN client_qualities.custom_parameters IS 'Optional JSONB overrides for template parameters specific to this client';

-- ========================================
-- UPDATE RLS POLICIES
-- ========================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view client qualities" ON client_qualities;
DROP POLICY IF EXISTS "Quality managers can create client qualities" ON client_qualities;
DROP POLICY IF EXISTS "Quality managers can update client qualities" ON client_qualities;
DROP POLICY IF EXISTS "Quality managers can delete client qualities" ON client_qualities;

-- Policy 1: Users can view client qualities for their lab or global access
CREATE POLICY "Users can view client qualities" ON client_qualities
    FOR SELECT USING (
        -- Quality managers and global admins can see all
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
        OR
        -- Lab personnel can see client qualities if they're working with samples from that client
        has_global_qc_access(auth.uid())
    );

-- Policy 2: Quality managers can create client-quality assignments
CREATE POLICY "Quality managers can create client qualities" ON client_qualities
    FOR INSERT WITH CHECK (
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Policy 3: Quality managers can update client-quality assignments
CREATE POLICY "Quality managers can update client qualities" ON client_qualities
    FOR UPDATE USING (
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Policy 4: Only global admins and quality admins can delete client-quality assignments
CREATE POLICY "Quality managers can delete client qualities" ON client_qualities
    FOR DELETE USING (
        get_user_qc_role(auth.uid()) IN ('global_quality_admin', 'global_admin')
    );

-- ========================================
-- ADD HELPER FUNCTION
-- ========================================

-- Function to get client quality spec with effective name (custom name or template name)
CREATE OR REPLACE FUNCTION get_client_quality_display_name(
    p_client_quality_id UUID,
    p_language TEXT DEFAULT 'EN'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_custom_name TEXT;
    v_template_id UUID;
    v_template_name TEXT;
BEGIN
    -- Get custom name and template_id from client_qualities
    SELECT custom_name, template_id
    INTO v_custom_name, v_template_id
    FROM client_qualities
    WHERE id = p_client_quality_id;

    -- If custom name exists, return it
    IF v_custom_name IS NOT NULL AND v_custom_name != '' THEN
        RETURN v_custom_name;
    END IF;

    -- Otherwise, fall back to template name in requested language
    RETURN get_quality_template_name(v_template_id, p_language);
END;
$$;

COMMENT ON FUNCTION get_client_quality_display_name IS 'Get display name for a client quality spec (custom name if set, otherwise template name)';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check that column was added
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_qualities'
        AND column_name = 'custom_name'
    ) THEN
        RAISE EXCEPTION 'Migration 043 verification failed: custom_name column not created';
    END IF;

    -- Check that indexes were created
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'client_qualities'
        AND indexname = 'idx_client_qualities_client_id'
    ) THEN
        RAISE EXCEPTION 'Migration 043 verification failed: idx_client_qualities_client_id index not created';
    END IF;

    RAISE NOTICE 'Migration 043 completed successfully: Enhanced client_qualities with custom naming';
END;
$$;

SELECT 'Migration 043: Enhanced client_qualities with custom naming completed' as status;
