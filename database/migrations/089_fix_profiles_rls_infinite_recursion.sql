-- Migration 089: Fix infinite recursion in profiles RLS policies
-- Date: 2025-10-31
-- Purpose: Replace recursive profiles policies with SECURITY DEFINER functions
--          to prevent infinite recursion when querying user_invitations with joins

-- Create helper functions that bypass RLS using SECURITY DEFINER
-- These functions check user permissions without triggering RLS policies

-- Check if user is a global admin
CREATE OR REPLACE FUNCTION is_global_admin_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT qc_role INTO user_role
    FROM profiles
    WHERE id = user_id;

    RETURN user_role IN ('global_admin', 'global_quality_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's laboratory_id
CREATE OR REPLACE FUNCTION get_user_lab_id(user_id UUID)
RETURNS UUID AS $$
DECLARE
    lab_id UUID;
BEGIN
    SELECT laboratory_id INTO lab_id
    FROM profiles
    WHERE id = user_id;

    RETURN lab_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is a lab quality manager
CREATE OR REPLACE FUNCTION is_lab_quality_manager_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT qc_role INTO user_role
    FROM profiles
    WHERE id = user_id;

    RETURN user_role = 'lab_quality_manager';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's qc_role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT qc_role INTO user_role
    FROM profiles
    WHERE id = user_id;

    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop existing recursive policies
DROP POLICY IF EXISTS "Global admins and managers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update user profiles" ON profiles;

-- Create new non-recursive SELECT policy using helper functions
CREATE POLICY "Users can view profiles based on role"
ON profiles
FOR SELECT
TO public
USING (
  -- User can view their own profile
  auth.uid() = id
  OR
  -- OR user is a global admin
  is_global_admin_user(auth.uid())
  OR
  -- OR user is a lab quality manager viewing profiles from their lab
  (
    is_lab_quality_manager_user(auth.uid()) AND
    laboratory_id = get_user_lab_id(auth.uid())
  )
);

-- Create new non-recursive UPDATE policy using helper functions
CREATE POLICY "Users can update profiles based on role"
ON profiles
FOR UPDATE
TO public
USING (
  -- User can update their own profile
  auth.uid() = id
  OR
  -- OR user is a global admin (can update anyone)
  is_global_admin_user(auth.uid())
  OR
  -- OR user is a lab quality manager updating profiles in their lab
  -- (but NOT updating other lab_quality_manager or higher roles)
  (
    is_lab_quality_manager_user(auth.uid()) AND
    laboratory_id = get_user_lab_id(auth.uid()) AND
    qc_role IN ('lab_personnel', 'lab_finance_manager')
  )
)
WITH CHECK (
  -- Same conditions for the new values
  auth.uid() = id
  OR
  is_global_admin_user(auth.uid())
  OR
  (
    is_lab_quality_manager_user(auth.uid()) AND
    laboratory_id = get_user_lab_id(auth.uid()) AND
    qc_role IN ('lab_personnel', 'lab_finance_manager')
  )
);

-- Add comments for documentation
COMMENT ON FUNCTION is_global_admin_user(UUID) IS
'Check if a user has global admin role. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

COMMENT ON FUNCTION get_user_lab_id(UUID) IS
'Get a user''s laboratory_id. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

COMMENT ON FUNCTION is_lab_quality_manager_user(UUID) IS
'Check if a user is a lab quality manager. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

COMMENT ON FUNCTION get_user_role(UUID) IS
'Get a user''s qc_role. Uses SECURITY DEFINER to bypass RLS and prevent infinite recursion.';

COMMENT ON POLICY "Users can view profiles based on role" ON profiles IS
'Non-recursive policy using SECURITY DEFINER functions. Allows users to view their own profile, global admins to view all profiles, and lab managers to view staff in their lab.';

COMMENT ON POLICY "Users can update profiles based on role" ON profiles IS
'Non-recursive policy using SECURITY DEFINER functions. Allows global admins to update any profile, lab managers to update staff in their lab (excluding other managers), and users to update their own profile.';
