-- Migration 100: Fix quality assessments RLS policies
-- Date: 2025-11-04
-- Purpose: Allow cuppers and graders to create and update quality assessments

-- Drop existing quality assessments policies
DROP POLICY IF EXISTS "Lab personnel can create quality assessments" ON quality_assessments;
DROP POLICY IF EXISTS "Users can view quality assessments based on sample access" ON quality_assessments;
DROP POLICY IF EXISTS "Cuppers and graders can create quality assessments" ON quality_assessments;
DROP POLICY IF EXISTS "Cuppers and graders can update quality assessments" ON quality_assessments;

-- Recreate SELECT policy (simplified to check user's lab)
CREATE POLICY "Users can view quality assessments based on sample access" ON quality_assessments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM samples
            JOIN profiles ON profiles.id = auth.uid()
            WHERE samples.id = sample_id AND (
                -- Lab personnel see their lab's assessments
                samples.laboratory_id = profiles.laboratory_id OR
                -- Global admins see everything
                profiles.is_global_admin = true
            )
        )
    );

-- NEW: Allow cuppers, graders, and lab personnel to INSERT quality assessments
CREATE POLICY "Cuppers and graders can create quality assessments" ON quality_assessments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM samples
            JOIN profiles ON profiles.id = auth.uid()
            WHERE samples.id = sample_id AND
            samples.laboratory_id = profiles.laboratory_id AND (
                -- Allow users with cupper or Q grader status or appropriate role
                profiles.is_cupper = true OR
                profiles.is_q_grader = true OR
                profiles.is_global_admin = true OR
                profiles.qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
            )
        )
    );

-- NEW: Allow cuppers, graders, and lab personnel to UPDATE quality assessments
CREATE POLICY "Cuppers and graders can update quality assessments" ON quality_assessments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM samples
            JOIN profiles ON profiles.id = auth.uid()
            WHERE samples.id = sample_id AND
            samples.laboratory_id = profiles.laboratory_id AND (
                -- Allow users with cupper or Q grader status or appropriate role
                profiles.is_cupper = true OR
                profiles.is_q_grader = true OR
                profiles.is_global_admin = true OR
                profiles.qc_role IN ('lab_personnel', 'lab_quality_manager', 'global_quality_admin', 'global_admin')
            )
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can view quality assessments based on sample access" ON quality_assessments IS
'Allows users to view quality assessments based on their role and access to the associated sample.';

COMMENT ON POLICY "Cuppers and graders can create quality assessments" ON quality_assessments IS
'Allows cuppers (is_cupper=true), Q graders (is_q_grader=true), and lab personnel to create quality assessments for samples in their laboratory.';

COMMENT ON POLICY "Cuppers and graders can update quality assessments" ON quality_assessments IS
'Allows cuppers (is_cupper=true), Q graders (is_q_grader=true), and lab personnel to update quality assessments for samples in their laboratory.';
