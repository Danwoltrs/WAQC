-- Migration 106: Fix RLS policy to allow all lab personnel to create samples
-- Date: 2025-11-25
-- Purpose: Add service role bypass and simplify INSERT policy to resolve error 42501

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Lab personnel can insert samples" ON samples;

-- Create updated INSERT policy with service role bypass
CREATE POLICY "Lab personnel can insert samples" ON samples
    FOR INSERT
    WITH CHECK (
        -- Service role bypasses all checks (for admin operations)
        auth.jwt() ->> 'role' = 'service_role'
        OR
        -- Lab personnel in the same lab OR global admins can insert anywhere
        (
            (
                laboratory_id = get_user_qc_laboratory(auth.uid())
                OR
                has_global_qc_access(auth.uid())
            )
            AND
            -- Explicitly check each role without IN operator to avoid array comparison
            (
                get_user_qc_role(auth.uid()) = 'lab_personnel' OR
                get_user_qc_role(auth.uid()) = 'lab_quality_manager' OR
                get_user_qc_role(auth.uid()) = 'global_quality_admin' OR
                get_user_qc_role(auth.uid()) = 'global_admin'
            )
        )
    );

COMMENT ON POLICY "Lab personnel can insert samples" ON samples IS
'Allows service role and all lab personnel to create samples. Global admins can create samples in any lab. Avoids IN operator to prevent array comparison errors.';

-- Also update the UPDATE policy for consistency
DROP POLICY IF EXISTS "Lab personnel can update samples" ON samples;

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
'Allows service role to bypass all checks, and lab personnel/admins to update samples in their lab. Global admins can update samples in any lab. Avoids IN operator to prevent array comparison errors.';

-- Verification query
SELECT
    'Migration 106 completed - All lab personnel can now create and update samples' as status,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'samples' AND policyname = 'Lab personnel can insert samples') as insert_policy_exists,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'samples' AND policyname = 'Lab personnel can update samples') as update_policy_exists;
