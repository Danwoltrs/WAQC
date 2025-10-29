-- Migration 085: Add RLS UPDATE policy for profiles table
-- Date: 2025-10-29
-- Purpose: Allow admins to update user profiles in the user management panel

-- Drop any existing UPDATE policies on profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;

-- Create comprehensive UPDATE policy for profiles
-- This allows:
-- 1. Users to update their own basic profile info
-- 2. Global admins to update ANY profile
-- 3. Lab quality managers to update profiles in their lab (excluding other managers/admins)
CREATE POLICY "Admins can update user profiles"
ON profiles
FOR UPDATE
TO public
USING (
  -- User can update their own profile
  auth.uid() = id
  OR
  -- OR user is a global admin (can update anyone)
  EXISTS (
    SELECT 1 FROM profiles admin
    WHERE admin.id = auth.uid()
    AND admin.qc_role = 'global_admin'
  )
  OR
  -- OR user is a lab quality manager updating profiles in their lab
  -- (but NOT updating other lab_quality_manager or higher roles)
  EXISTS (
    SELECT 1 FROM profiles manager
    WHERE manager.id = auth.uid()
    AND manager.qc_role = 'lab_quality_manager'
    AND profiles.laboratory_id = manager.laboratory_id
    AND profiles.qc_role IN ('lab_personnel', 'lab_finance_manager')
  )
)
WITH CHECK (
  -- Same conditions for the new values
  auth.uid() = id
  OR
  EXISTS (
    SELECT 1 FROM profiles admin
    WHERE admin.id = auth.uid()
    AND admin.qc_role = 'global_admin'
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles manager
    WHERE manager.id = auth.uid()
    AND manager.qc_role = 'lab_quality_manager'
    AND profiles.laboratory_id = manager.laboratory_id
    AND profiles.qc_role IN ('lab_personnel', 'lab_finance_manager')
  )
);

-- Add comment for documentation
COMMENT ON POLICY "Admins can update user profiles" ON profiles IS
'Allows global admins to update any profile, lab managers to update staff in their lab (excluding other managers), and users to update their own profile';
