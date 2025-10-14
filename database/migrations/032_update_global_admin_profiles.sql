-- Migration: Update global admin profiles to ensure they have full_name set
-- This fixes the "User" display issue for global admins

-- Update profiles for global admins who might not have full_name set
UPDATE profiles
SET
  full_name = COALESCE(
    full_name,
    CASE
      WHEN email = 'daniel@wolthers.com' THEN 'Daniel Wolthers'
      WHEN email = 'anderson@wolthers.com' THEN 'Anderson Wolthers'
      WHEN email = 'edgar@wolthers.com' THEN 'Edgar Wolthers'
      ELSE INITCAP(SPLIT_PART(email, '@', 1))
    END
  ),
  qc_enabled = true,
  is_global_admin = true,
  qc_role = 'global_admin'
WHERE email IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com')
  AND (full_name IS NULL OR full_name = '' OR full_name = 'User' OR qc_enabled = false OR is_global_admin = false);

-- Ensure all @wolthers.com users have qc_enabled set to true
UPDATE profiles
SET qc_enabled = true
WHERE email LIKE '%@wolthers.com'
  AND qc_enabled = false;

-- Add index on email for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Add index on qc_role for faster permission checks
CREATE INDEX IF NOT EXISTS idx_profiles_qc_role ON profiles(qc_role);

-- Verify the update
DO $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM profiles
  WHERE is_global_admin = true;

  RAISE NOTICE 'Updated % global admin profile(s)', admin_count;
END $$;
