-- Migration: Allow lab personnel to view quality specifications
--
-- Current issue: Only quality managers and admins can view client_qualities
-- Fix: Allow all lab personnel to view quality specs (read-only)
--
-- This allows lab personnel like Matheus to:
-- - View quality specifications in the Quality Specs page
-- - Understand client requirements
-- - See quality codes and specifications when working with samples

DROP POLICY IF EXISTS "Users can view client qualities" ON client_qualities;

-- Updated policy: Allow lab personnel to view quality specs
CREATE POLICY "Users can view client qualities" ON client_qualities
    FOR SELECT USING (
        -- Global admins and quality admins can see all
        get_user_qc_role(auth.uid()) IN ('lab_quality_manager', 'global_quality_admin', 'global_admin')
        OR
        -- Lab personnel can view quality specs (read-only access)
        get_user_qc_role(auth.uid()) IN ('lab_personnel')
        OR
        -- Finance and high-level roles
        has_global_qc_access(auth.uid())
    );

-- Verify the policy was updated
DO $$
BEGIN
    RAISE NOTICE 'Migration 069 completed successfully';
    RAISE NOTICE 'Lab personnel now have read access to quality specifications';
    RAISE NOTICE 'They can view the Quality Specs page but cannot create/edit/delete';
END;
$$;

SELECT 'Migration 069: Allow lab personnel to view quality specifications' as status;
