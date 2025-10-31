-- Migration 096: Fix email case sensitivity in invitation matching
-- Date: 2025-10-31
-- Purpose: Make email comparison case-insensitive in handle_new_user() trigger
--          to prevent issues when Microsoft OAuth returns different casing

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop existing function
DROP FUNCTION IF EXISTS handle_new_user();

-- Recreate function with case-insensitive email matching
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Check if this user was invited (has a pending invitation)
  -- Use LOWER() for case-insensitive email matching
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

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON FUNCTION handle_new_user() IS
'Automatically creates a profile when a user signs up via password or OAuth. Uses case-insensitive email matching to find invitations. If an invitation exists, uses invitation data; otherwise creates basic profile from user metadata.';
