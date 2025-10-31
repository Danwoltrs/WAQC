-- Migration 094: Nuclear reset - Drop ALL policies and recreate from scratch
-- Date: 2025-10-31
-- Purpose: Completely reset RLS policies to fix persistent recursion issues

-- ========================================
-- PART 1: NUCLEAR DROP - Remove ALL policies
-- ========================================

-- Disable RLS temporarily to ensure clean slate
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations DISABLE ROW LEVEL SECURITY;

-- Drop ALL policies on profiles (catch any we might have missed)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', r.policyname);
    END LOOP;
END $$;

-- Drop ALL policies on user_invitations
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'user_invitations')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_invitations', r.policyname);
    END LOOP;
END $$;

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- ========================================
-- PART 2: RECREATE PROFILES POLICIES
-- ========================================

-- SELECT policy for profiles (non-recursive using SECURITY DEFINER functions)
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

-- UPDATE policy for profiles (non-recursive using SECURITY DEFINER functions)
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
  -- User can only insert their own profile
  auth.uid() = id
);

-- ========================================
-- PART 3: RECREATE USER_INVITATIONS POLICIES
-- ========================================

-- SELECT policy for admins (non-recursive)
CREATE POLICY "invitations_select_policy"
ON user_invitations
FOR SELECT
TO authenticated
USING (
  is_global_admin_user(auth.uid()) OR
  is_lab_quality_manager_user(auth.uid())
);

-- SELECT policy for public (unauthenticated users viewing their invitation)
CREATE POLICY "public_invitations_select_policy"
ON user_invitations
FOR SELECT
TO anon
USING (
  status = 'pending' AND
  expires_at > NOW()
);

-- INSERT policy for invitations (non-recursive)
CREATE POLICY "invitations_insert_policy"
ON user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  is_global_admin_user(auth.uid()) OR
  is_lab_quality_manager_user(auth.uid())
);

-- UPDATE policy for invitations (non-recursive)
CREATE POLICY "invitations_update_policy"
ON user_invitations
FOR UPDATE
TO authenticated
USING (
  is_global_admin_user(auth.uid())
);

-- ========================================
-- PART 4: ADD COMMENTS
-- ========================================

COMMENT ON POLICY "profiles_select_policy" ON profiles IS
'Non-recursive SELECT policy using SECURITY DEFINER functions. Allows users to view their own profile, global admins to view all profiles, and lab managers to view staff in their lab.';

COMMENT ON POLICY "profiles_update_policy" ON profiles IS
'Non-recursive UPDATE policy using SECURITY DEFINER functions. Allows global admins to update any profile, lab managers to update staff in their lab, and users to update their own profile.';

COMMENT ON POLICY "profiles_insert_policy" ON profiles IS
'Allows authenticated users to create their own profile record during signup or invitation acceptance.';

COMMENT ON POLICY "invitations_select_policy" ON user_invitations IS
'Non-recursive SELECT policy for authenticated admins and lab quality managers to view invitations.';

COMMENT ON POLICY "public_invitations_select_policy" ON user_invitations IS
'Allows unauthenticated users to view pending unexpired invitations. Needed for accept-invite page. Non-recursive.';

COMMENT ON POLICY "invitations_insert_policy" ON user_invitations IS
'Non-recursive INSERT policy allowing admins and lab quality managers to create invitations.';

COMMENT ON POLICY "invitations_update_policy" ON user_invitations IS
'Non-recursive UPDATE policy allowing only global admins to update invitations.';

-- ========================================
-- VERIFICATION QUERY
-- ========================================

-- Run this to verify only the correct policies exist:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('profiles', 'user_invitations')
-- ORDER BY tablename, policyname;
