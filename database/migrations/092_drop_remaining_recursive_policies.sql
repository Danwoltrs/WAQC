-- Migration 092: Drop remaining recursive policies that were missed
-- Date: 2025-10-31
-- Purpose: Drop old recursive policies that weren't removed by migration 091

-- ========================================
-- DROP OLD RECURSIVE POLICIES ON PROFILES
-- ========================================

DROP POLICY IF EXISTS "profiles_read_access" ON profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON profiles;

-- ========================================
-- DROP OLD RECURSIVE POLICIES ON USER_INVITATIONS
-- ========================================

DROP POLICY IF EXISTS "Company admins can manage their company invitations" ON user_invitations;
DROP POLICY IF EXISTS "Wolthers staff can manage all invitations" ON user_invitations;
DROP POLICY IF EXISTS "Anyone can view pending unexpired invitations" ON user_invitations;
DROP POLICY IF EXISTS "Anyone can accept pending unexpired invitations" ON user_invitations;

-- ========================================
-- VERIFICATION
-- ========================================

-- After running this migration, only these policies should remain:
--
-- PROFILES:
-- - profiles_select_policy (non-recursive)
-- - profiles_update_policy (non-recursive)
-- - profiles_insert_policy (non-recursive)
--
-- USER_INVITATIONS:
-- - invitations_select_policy (non-recursive)
-- - invitations_insert_policy (non-recursive)
-- - invitations_update_policy (non-recursive)

COMMENT ON TABLE profiles IS
'User profiles table with non-recursive RLS policies. Old recursive policies removed in migration 092.';

COMMENT ON TABLE user_invitations IS
'User invitations table with non-recursive RLS policies. Old recursive policies removed in migration 092.';
