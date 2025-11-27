-- Fix RLS policy on profiles table to allow handle_new_user() trigger to create profiles
--
-- Problem: The current INSERT policy requires auth.uid() = id, but when the trigger runs,
-- auth.uid() is NULL (trigger runs in system context), blocking all new user signups.
--
-- Solution: Allow inserts when:
-- 1. auth.uid() = id (normal manual profile creation)
-- 2. OR id exists in auth.users (for trigger-created profiles during signup)

-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS profiles_insert_policy ON profiles;

-- Create new INSERT policy that works with the trigger
CREATE POLICY profiles_insert_policy ON profiles
  FOR INSERT
  WITH CHECK (
    -- Allow if current user is creating their own profile
    auth.uid() = id
    -- OR if the id exists in auth.users (trigger creating profile for new signup)
    OR EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = profiles.id
    )
  );

-- Comment for documentation
COMMENT ON POLICY profiles_insert_policy ON profiles IS
  'Allows users to create their own profile OR allows the handle_new_user() trigger to create profiles for new signups';
