-- Migration 097: Fix workflow stage update issue
-- Date: 2025-11-03
-- Purpose: Investigate and fix the "operator does not exist: text[] = text" error
--          when updating workflow_stage from received -> roasting

-- First, let's verify the assigned_to column type
DO $$
DECLARE
    v_column_type TEXT;
BEGIN
    SELECT data_type INTO v_column_type
    FROM information_schema.columns
    WHERE table_name = 'samples'
    AND column_name = 'assigned_to';

    RAISE NOTICE 'assigned_to column type: %', v_column_type;
END $$;

-- Check if there are any RLS policies that might be comparing arrays
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, pg_get_expr(polqual, polrelid) as policy_expression
        FROM pg_policy
        WHERE polrelid = 'samples'::regclass
    )
    LOOP
        RAISE NOTICE 'Policy: % - Expression: %', r.policyname, r.policy_expression;
    END LOOP;
END $$;

-- Drop and recreate the update policy for samples to ensure it's correct
DROP POLICY IF EXISTS "Lab personnel can update samples" ON samples;

CREATE POLICY "Lab personnel can update samples" ON samples
    FOR UPDATE
    USING (
        -- User must be lab personnel in the same lab OR global admin
        (
            laboratory_id = get_user_qc_laboratory(auth.uid())
            OR
            has_global_qc_access(auth.uid())
        )
        AND
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    )
    WITH CHECK (
        -- Same check for the updated row
        (
            laboratory_id = get_user_qc_laboratory(auth.uid())
            OR
            has_global_qc_access(auth.uid())
        )
        AND
        get_user_qc_role(auth.uid()) IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
    );

-- Verification message
SELECT 'Migration 097 completed - Check logs for policy details' as status;
