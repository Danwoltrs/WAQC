-- Fix database triggers to prevent authentication blocking
-- This migration adds proper error handling and RLS bypass to authentication triggers

-- Drop existing triggers and functions
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.update_last_login();
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate update_last_login function with proper error handling and RLS bypass
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update last login timestamp
    -- Using SECURITY DEFINER to bypass RLS
    UPDATE profiles
    SET last_login_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.id;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- If update fails (e.g., profile doesn't exist yet), don't block authentication
        -- Log the error but allow the auth process to continue
        RAISE WARNING 'Failed to update last_login for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Recreate handle_new_user function with proper error handling and conflict resolution
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_exists BOOLEAN;
BEGIN
  -- Check if profile already exists (for Azure AD users)
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = NEW.id) INTO profile_exists;

  IF profile_exists THEN
    -- Profile already exists, just return without error
    RETURN NEW;
  END IF;

  -- Create profile for new user
  -- Using SECURITY DEFINER to bypass RLS
  INSERT INTO profiles (
    id,
    email,
    full_name,
    qc_enabled,
    qc_role,
    is_global_admin,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    CASE WHEN NEW.email LIKE '%@wolthers.com' THEN true ELSE false END,
    CASE WHEN NEW.email LIKE '%@wolthers.com' THEN 'lab_personnel'::text ELSE NULL END,
    NEW.email IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If profile creation fails, don't block user creation
    -- This ensures Azure AD auth can complete even if profile logic has issues
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_login
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.update_last_login();

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.update_last_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
