-- Migration: Fix authentication stability issues
-- Date: 2025-12-04
-- Purpose:
--   1. Fix profiles INSERT policy that causes 42501 errors
--   2. Optimize RLS helper functions to reduce timeouts
--   3. Ensure handle_new_user trigger works reliably

-- ========================================
-- PART 1: FIX PROFILES INSERT POLICY
-- ========================================

-- Drop the problematic INSERT policy that queries auth.users
-- The auth.users query fails for anon/authenticated roles
DROP POLICY IF EXISTS profiles_insert_policy ON profiles;

-- Create simpler policy that only authenticated users can use
-- Note: handle_new_user() trigger uses SECURITY DEFINER and bypasses RLS entirely
CREATE POLICY profiles_insert_policy ON profiles
  FOR INSERT
  TO authenticated  -- Only authenticated users, not anon
  WITH CHECK (
    -- User can only insert their own profile
    auth.uid() = id
  );

COMMENT ON POLICY profiles_insert_policy ON profiles IS
'Allows authenticated users to create their own profile as fallback. The handle_new_user() trigger (SECURITY DEFINER) handles automatic profile creation during signup and bypasses RLS.';

-- ========================================
-- PART 2: OPTIMIZE RLS HELPER FUNCTIONS
-- ========================================

-- Create a single optimized function that gets all auth context in one query
-- This replaces 3-4 separate function calls with a single query
CREATE OR REPLACE FUNCTION get_user_auth_context(target_user_id UUID)
RETURNS TABLE (
  is_global_admin BOOLEAN,
  is_lab_manager BOOLEAN,
  user_lab_id UUID,
  user_role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.qc_role IN ('global_admin', 'global_quality_admin') AS is_global_admin,
    p.qc_role = 'lab_quality_manager' AS is_lab_manager,
    p.laboratory_id AS user_lab_id,
    p.qc_role AS user_role
  FROM profiles p
  WHERE p.id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_auth_context(UUID) IS
'Optimized single-query function to get all user auth context. Reduces RLS overhead from 3-4 queries to 1.';

-- Update existing helper functions to be more efficient (use STABLE hint)
CREATE OR REPLACE FUNCTION is_global_admin_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Quick exit if no user
    IF user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT qc_role INTO user_role
    FROM profiles
    WHERE id = user_id;

    RETURN COALESCE(user_role IN ('global_admin', 'global_quality_admin'), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_lab_id(user_id UUID)
RETURNS UUID AS $$
DECLARE
    lab_id UUID;
BEGIN
    -- Quick exit if no user
    IF user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT laboratory_id INTO lab_id
    FROM profiles
    WHERE id = user_id;

    RETURN lab_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_lab_quality_manager_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Quick exit if no user
    IF user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT qc_role INTO user_role
    FROM profiles
    WHERE id = user_id;

    RETURN COALESCE(user_role = 'lab_quality_manager', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ========================================
-- PART 3: ENSURE TRIGGER IS CORRECT
-- ========================================

-- Recreate the handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
  default_lab_id UUID;
  is_wolthers_email BOOLEAN;
  is_admin_email BOOLEAN;
BEGIN
  -- Check for Wolthers domain
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';
  is_admin_email := NEW.email IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com');

  -- Get default lab ID
  SELECT id INTO default_lab_id FROM laboratories WHERE code = 'SANTOS_HQ' LIMIT 1;

  -- Check if this user was invited (has a pending invitation)
  SELECT * INTO invitation_record
  FROM user_invitations
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  -- If invitation exists, create profile with invitation data
  IF FOUND THEN
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      full_name,
      qc_role,
      laboratory_id,
      is_cupper,
      is_q_grader,
      qc_enabled,
      is_global_admin,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(invitation_record.first_name, ''),
      COALESCE(invitation_record.last_name, ''),
      COALESCE(invitation_record.first_name || ' ' || invitation_record.last_name, split_part(NEW.email, '@', 1)),
      COALESCE(invitation_record.qc_role, 'lab_personnel'),
      invitation_record.laboratory_id,
      COALESCE(invitation_record.is_cupper, FALSE),
      COALESCE(invitation_record.is_q_grader, FALSE),
      COALESCE(invitation_record.qc_enabled, TRUE),
      invitation_record.qc_role IN ('global_admin', 'global_quality_admin'),
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate profile errors

    -- Mark invitation as accepted
    UPDATE user_invitations
    SET status = 'accepted',
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = invitation_record.id;

  ELSE
    -- No invitation found - create basic profile from user metadata
    INSERT INTO public.profiles (
      id,
      email,
      first_name,
      last_name,
      full_name,
      qc_role,
      laboratory_id,
      qc_enabled,
      is_global_admin,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      CASE WHEN is_admin_email THEN 'global_admin' ELSE 'lab_personnel' END,
      CASE WHEN is_wolthers_email THEN default_lab_id ELSE NULL END,
      is_wolthers_email,  -- Wolthers users are enabled by default
      is_admin_email,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;  -- Prevent duplicate profile errors
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'handle_new_user failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON FUNCTION handle_new_user() IS
'Automatically creates a profile when a user signs up. Uses SECURITY DEFINER to bypass RLS. Has ON CONFLICT DO NOTHING to prevent duplicate errors. Handles exceptions gracefully.';
