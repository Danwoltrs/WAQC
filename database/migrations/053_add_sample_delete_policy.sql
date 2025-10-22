-- Migration 053: Add RLS policy to allow global admins to delete samples
-- This enables the sample deletion feature for global administrators

-- ========================================
-- DROP EXISTING DELETE POLICY (if any)
-- ========================================

DROP POLICY IF EXISTS "Global admins can delete samples" ON samples;

-- ========================================
-- CREATE DELETE POLICY FOR GLOBAL ADMINS
-- ========================================

CREATE POLICY "Global admins can delete samples"
ON samples
FOR DELETE
TO authenticated
USING (
  -- Allow deletion only for global admins
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.is_global_admin = true OR profiles.qc_role = 'global_admin')
  )
);

COMMENT ON POLICY "Global admins can delete samples" ON samples IS
'Allows global administrators to delete samples and all related records (quality assessments, certificates, activities) via CASCADE.';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'samples'
        AND policyname = 'Global admins can delete samples'
    ) THEN
        RAISE EXCEPTION 'Migration 053 verification failed: DELETE policy not created';
    END IF;

    RAISE NOTICE 'Migration 053 completed successfully';
    RAISE NOTICE 'Global admins can now delete samples via RLS';
END;
$$;

SELECT 'Migration 053: Added sample DELETE policy for global admins' as status;
