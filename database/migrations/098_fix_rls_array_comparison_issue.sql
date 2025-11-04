-- Migration 098: Fix RLS array comparison issue for sample updates
-- Date: 2025-11-04
-- Purpose: Fix "operator does not exist: text[] = text" error when updating workflow_stage
--          The issue is IN operator comparing with array types in RLS policy

-- Drop the problematic policy
DROP POLICY IF EXISTS "Lab personnel can update samples" ON samples;

-- Create a simpler UPDATE policy that avoids array comparisons
CREATE POLICY "Lab personnel can update samples" ON samples
    FOR UPDATE
    USING (
        -- Service role bypasses all checks (for admin operations)
        auth.jwt() ->> 'role' = 'service_role'
        OR
        -- User must be lab personnel in the same lab OR global admin
        (
            (
                laboratory_id = get_user_qc_laboratory(auth.uid())
                OR
                has_global_qc_access(auth.uid())
            )
            AND
            -- Explicitly check role without IN operator to avoid array comparison
            (
                get_user_qc_role(auth.uid()) = 'lab_personnel' OR
                get_user_qc_role(auth.uid()) = 'lab_quality_manager' OR
                get_user_qc_role(auth.uid()) = 'global_quality_admin' OR
                get_user_qc_role(auth.uid()) = 'global_admin'
            )
        )
    )
    WITH CHECK (
        -- Service role bypasses all checks
        auth.jwt() ->> 'role' = 'service_role'
        OR
        -- Same check for the updated row (avoid IN operator)
        (
            (
                laboratory_id = get_user_qc_laboratory(auth.uid())
                OR
                has_global_qc_access(auth.uid())
            )
            AND
            (
                get_user_qc_role(auth.uid()) = 'lab_personnel' OR
                get_user_qc_role(auth.uid()) = 'lab_quality_manager' OR
                get_user_qc_role(auth.uid()) = 'global_quality_admin' OR
                get_user_qc_role(auth.uid()) = 'global_admin'
            )
        )
    );

COMMENT ON POLICY "Lab personnel can update samples" ON samples IS
'Allows service role to bypass all checks, and lab personnel/admins to update samples in their lab. Avoids IN operator to prevent array comparison errors.';

-- Verification message
SELECT 'Migration 098 completed - Fixed array comparison in UPDATE policy' as status;
