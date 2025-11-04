-- Migration 097: Allow lab personnel to view other users in their lab
-- Date: 2025-11-04
-- Purpose: Fix cupper assignment - lab personnel need to see other cuppers in their lab

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;

-- Recreate with additional condition for lab personnel
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
  OR
  -- OR user is lab personnel viewing other users in the same lab
  -- (needed for cupper assignment and collaboration features)
  (
    get_user_lab_id(auth.uid()) IS NOT NULL AND
    laboratory_id = get_user_lab_id(auth.uid())
  )
);

COMMENT ON POLICY "profiles_select_policy" ON profiles IS
'Non-recursive SELECT policy using SECURITY DEFINER functions. Allows:
1. Users to view their own profile
2. Global admins to view all profiles
3. Lab managers to view staff in their lab
4. Lab personnel to view other users in their lab (for cupper assignment and collaboration)';
