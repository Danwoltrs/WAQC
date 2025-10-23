-- Migration: Grant lab personnel full access to create/edit quality specifications
--
-- Update from migration 069: Lab personnel now need full access, not just read-only
-- They should be able to create, update, and view quality specs
-- Only deletion remains restricted to quality admins

-- Policy 1: Allow lab personnel to view quality specs
DROP POLICY IF EXISTS "Users can view client qualities" ON client_qualities;
CREATE POLICY "Users can view client qualities" ON client_qualities
    FOR SELECT USING (
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
        OR
        has_global_qc_access(auth.uid())
    );

-- Policy 2: Allow lab personnel to create quality specs
DROP POLICY IF EXISTS "Quality managers can create client qualities" ON client_qualities;
CREATE POLICY "Quality managers can create client qualities" ON client_qualities
    FOR INSERT WITH CHECK (
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Policy 3: Allow lab personnel to update quality specs
DROP POLICY IF EXISTS "Quality managers can update client qualities" ON client_qualities;
CREATE POLICY "Quality managers can update client qualities" ON client_qualities
    FOR UPDATE USING (
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Policy 4: Deletion still restricted to quality admins and global admins (unchanged)
-- No changes needed to delete policy

-- Verify the updates
DO $$
BEGIN
    RAISE NOTICE 'Migration 070 completed successfully';
    RAISE NOTICE 'Lab personnel now have full access to quality specifications:';
    RAISE NOTICE '  - View: Yes';
    RAISE NOTICE '  - Create: Yes';
    RAISE NOTICE '  - Edit: Yes';
    RAISE NOTICE '  - Delete: No (still restricted to quality/global admins)';
END;
$$;

SELECT 'Migration 070: Grant lab personnel full create/edit access to quality specs' as status;
