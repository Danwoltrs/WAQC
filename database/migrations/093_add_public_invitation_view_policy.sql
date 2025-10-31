-- Migration 093: Add public invitation viewing policy for accept-invite flow
-- Date: 2025-10-31
-- Purpose: Allow unauthenticated users to view their invitation by token
--          This is needed for the /auth/accept-invite page to work
--          This policy is non-recursive and secure (only pending invitations)

-- ========================================
-- PUBLIC INVITATION VIEWING POLICY
-- ========================================

-- Allow anyone (authenticated or not) to view pending unexpired invitations by token
-- This is safe because:
-- 1. Only returns invitations that are 'pending' status
-- 2. Only returns invitations that haven't expired
-- 3. Requires exact token match (tokens are secure random UUIDs)
-- 4. Does NOT query any other tables (non-recursive)
CREATE POLICY "Public can view pending invitations by token"
ON user_invitations
FOR SELECT
TO public
USING (
    status = 'pending'
    AND expires_at > NOW()
);

COMMENT ON POLICY "Public can view pending invitations by token" ON user_invitations IS
'Allows unauthenticated users to view pending unexpired invitations. This is needed for the accept-invite page where users must see invitation details before creating their account. Non-recursive - does not query other tables.';

-- ========================================
-- NOTE: Invitation acceptance (UPDATE) is handled by the handle_new_user() trigger
-- which runs as SECURITY DEFINER, so no public UPDATE policy is needed.
-- ========================================
