-- Migration 091: Comprehensive fix for invitation policies and recursion
-- Date: 2025-10-31
-- Purpose: Fix all remaining policy issues and prevent infinite recursion

-- ========================================
-- PART 1: DROP ALL EXISTING POLICIES
-- ========================================

-- Drop ALL existing policies on user_invitations to start clean
DROP POLICY IF EXISTS "Admins can view invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Global admins can update invitations" ON user_invitations;
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON user_invitations; -- This was the problematic one!

-- Drop ALL existing policies on profiles to start clean
DROP POLICY IF EXISTS "Users can view profiles based on role" ON profiles;
DROP POLICY IF EXISTS "Users can update profiles based on role" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Global admins and managers can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update user profiles" ON profiles;

-- ========================================
-- PART 2: RECREATE PROFILES POLICIES
-- ========================================

-- SELECT policy for profiles
CREATE POLICY "profiles_select_policy"
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

-- UPDATE policy for profiles
CREATE POLICY "profiles_update_policy"
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

-- INSERT policy for profiles (for new user signup)
CREATE POLICY "profiles_insert_policy"
ON profiles
FOR INSERT
TO public
WITH CHECK (
  -- User can only insert their own profile (auth.uid() matches the id)
  auth.uid() = id
);

-- ========================================
-- PART 3: RECREATE USER_INVITATIONS POLICIES
-- ========================================

-- SELECT policy for invitations - admins and owners only
CREATE POLICY "invitations_select_policy"
ON user_invitations
FOR SELECT
TO public
USING (
  -- Global admins and lab quality managers can view all invitations
  is_global_admin_user(auth.uid()) OR
  is_lab_quality_manager_user(auth.uid())
);

-- INSERT policy for invitations
CREATE POLICY "invitations_insert_policy"
ON user_invitations
FOR INSERT
TO public
WITH CHECK (
  is_global_admin_user(auth.uid()) OR
  is_lab_quality_manager_user(auth.uid())
);

-- UPDATE policy for invitations
CREATE POLICY "invitations_update_policy"
ON user_invitations
FOR UPDATE
TO public
USING (
  is_global_admin_user(auth.uid())
);

-- ========================================
-- PART 4: ADD COMMENTS
-- ========================================

COMMENT ON POLICY "profiles_select_policy" ON profiles IS
'Non-recursive policy using SECURITY DEFINER functions. Allows users to view their own profile, global admins to view all profiles, and lab managers to view staff in their lab.';

COMMENT ON POLICY "profiles_update_policy" ON profiles IS
'Non-recursive policy using SECURITY DEFINER functions. Allows global admins to update any profile, lab managers to update staff in their lab (excluding other managers), and users to update their own profile.';

COMMENT ON POLICY "profiles_insert_policy" ON profiles IS
'Allows authenticated users to create their own profile record during signup or invitation acceptance';

COMMENT ON POLICY "invitations_select_policy" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows only global admins and lab quality managers to view invitations.';

COMMENT ON POLICY "invitations_insert_policy" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows global admins and lab quality managers to create invitations.';

COMMENT ON POLICY "invitations_update_policy" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows only global admins to update invitations.';
