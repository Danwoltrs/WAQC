-- Add user management fields to profiles table
-- This migration adds fields required for the comprehensive user management system

-- Add first_name and last_name columns (keeping full_name for backward compatibility)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS is_cupper BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN profiles.first_name IS 'User first name for display in user management';
COMMENT ON COLUMN profiles.last_name IS 'User last name/surname for display in user management';
COMMENT ON COLUMN profiles.is_cupper IS 'Designates if user is qualified as a cupper for cupping sessions';
COMMENT ON COLUMN profiles.last_login_at IS 'Last login timestamp for activity tracking';

-- Create index for cupper queries (for assigning cuppers to sessions)
CREATE INDEX IF NOT EXISTS idx_profiles_is_cupper ON profiles(is_cupper) WHERE is_cupper = true;

-- Create index for last login tracking
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON profiles(last_login_at DESC);

-- Optionally migrate existing full_name to first_name/last_name if needed
-- This will split full_name on the first space
-- Comment out if you prefer to handle this manually
UPDATE profiles
SET
    first_name = COALESCE(first_name, SPLIT_PART(full_name, ' ', 1)),
    last_name = COALESCE(last_name, SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1))
WHERE first_name IS NULL OR last_name IS NULL;

-- Function to update last_login_at when user authenticates
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles
    SET last_login_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger for auth.users would need to be created if using Supabase Auth
-- This may require admin privileges depending on your Supabase setup
-- CREATE TRIGGER on_auth_user_login
--     AFTER UPDATE OF last_sign_in_at ON auth.users
--     FOR EACH ROW
--     WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
--     EXECUTE FUNCTION update_last_login();
