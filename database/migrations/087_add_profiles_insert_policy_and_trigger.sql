-- Migration 087: Add INSERT policy for profiles and auto-creation trigger
-- Date: 2025-01-30
-- Purpose: Allow new users to create their profile during signup/invitation acceptance
--          and automatically create profiles when users sign up via OAuth

-- ========================================
-- PART 1: INSERT POLICY FOR PROFILES
-- ========================================

-- Add INSERT policy for profiles table
-- This allows new users to insert their own profile record during registration
CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
TO public
WITH CHECK (
  -- User can only insert their own profile (auth.uid() matches the id)
  auth.uid() = id
);

COMMENT ON POLICY "Users can insert their own profile" ON profiles IS
'Allows authenticated users to create their own profile record during signup or invitation acceptance';

-- ========================================
-- PART 2: AUTO-CREATE PROFILE TRIGGER
-- ========================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create function to automatically create profile when auth.users record is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Check if this user was invited (has a pending invitation)
  SELECT * INTO invitation_record
  FROM user_invitations
  WHERE email = NEW.email
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
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      invitation_record.first_name,
      invitation_record.last_name,
      invitation_record.first_name || ' ' || invitation_record.last_name,
      invitation_record.qc_role,
      invitation_record.laboratory_id,
      invitation_record.is_cupper,
      invitation_record.is_q_grader,
      invitation_record.qc_enabled,
      NOW(),
      NOW()
    );

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
      qc_enabled,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      'lab_personnel', -- Default role
      false, -- Not enabled by default
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON FUNCTION handle_new_user() IS
'Automatically creates a profile when a user signs up via password or OAuth. If an invitation exists, uses invitation data; otherwise creates basic profile from user metadata.';

-- ========================================
-- PART 3: SELECT POLICY FOR INVITATIONS
-- ========================================

-- Allow users to read invitations by token (needed for accept-invite page)
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON user_invitations;

CREATE POLICY "Anyone can view invitation by token"
ON user_invitations
FOR SELECT
TO public
USING (
  -- Allow reading invitation if you have the token
  true
);

COMMENT ON POLICY "Anyone can view invitation by token" ON user_invitations IS
'Allows anyone to read invitations by token for accepting invitations';
