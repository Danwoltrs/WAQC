-- Migration 090: Fix infinite recursion in user_invitations RLS policies
-- Date: 2025-10-31
-- Purpose: Replace recursive user_invitations policies with SECURITY DEFINER functions
--          to prevent infinite recursion when querying with joins to profiles

-- Drop existing recursive policies on user_invitations
DROP POLICY IF EXISTS "Admins can view invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;
DROP POLICY IF EXISTS "Global admins can update invitations" ON user_invitations;

-- Create new non-recursive policies using the helper functions from migration 089
-- These functions bypass RLS to prevent infinite recursion

-- Only global admins and lab admins can view invitations
CREATE POLICY "Admins can view invitations" ON user_invitations
    FOR SELECT
    USING (
        is_global_admin_user(auth.uid()) OR
        is_lab_quality_manager_user(auth.uid())
    );

-- Only global admins and lab admins can create invitations
CREATE POLICY "Admins can create invitations" ON user_invitations
    FOR INSERT
    WITH CHECK (
        is_global_admin_user(auth.uid()) OR
        is_lab_quality_manager_user(auth.uid())
    );

-- Only global admins can update invitations
CREATE POLICY "Global admins can update invitations" ON user_invitations
    FOR UPDATE
    USING (
        is_global_admin_user(auth.uid())
    );

-- Add comments for documentation
COMMENT ON POLICY "Admins can view invitations" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows global admins and lab quality managers to view all invitations.';

COMMENT ON POLICY "Admins can create invitations" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows global admins and lab quality managers to create invitations.';

COMMENT ON POLICY "Global admins can update invitations" ON user_invitations IS
'Non-recursive policy using SECURITY DEFINER functions. Allows only global admins to update invitations.';
