-- Migration 032: Add RLS policy for admins to view all profiles
-- Date: 2025-10-14
-- Purpose: Allow global admins and lab managers to view profiles they need access to

-- Drop the old restrictive policy that only allowed users to view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Allow global admins and quality managers to view all profiles
CREATE POLICY "Global admins and managers can view all profiles"
ON profiles
FOR SELECT
TO public
USING (
  -- User can view their own profile
  auth.uid() = id
  OR
  -- OR user is a global admin
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.is_global_admin = true OR profiles.qc_role IN ('global_admin', 'global_quality_admin'))
  )
  OR
  -- OR user is a lab quality manager viewing profiles from their lab
  EXISTS (
    SELECT 1 FROM profiles viewer
    WHERE viewer.id = auth.uid()
    AND viewer.qc_role = 'lab_quality_manager'
    AND profiles.laboratory_id = viewer.laboratory_id
  )
);
