-- Migration 092: Optimize profiles RLS with single query
-- Date: 2025-11-04
-- Purpose: Reduce RLS overhead by using a single query instead of multiple function calls
--          This dramatically improves profile fetch performance on production

-- Create a single optimized function that checks all conditions in one query
CREATE OR REPLACE FUNCTION can_view_profile(profile_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_user_id UUID;
    current_user_role TEXT;
    current_user_lab_id UUID;
    target_profile_lab_id UUID;
BEGIN
    current_user_id := auth.uid();

    -- Quick check: viewing own profile (no additional query needed)
    IF current_user_id = profile_user_id THEN
        RETURN TRUE;
    END IF;

    -- Single query to get both current user and target profile info
    SELECT
        cu.qc_role,
        cu.laboratory_id,
        tp.laboratory_id
    INTO
        current_user_role,
        current_user_lab_id,
        target_profile_lab_id
    FROM profiles cu
    LEFT JOIN profiles tp ON tp.id = profile_user_id
    WHERE cu.id = current_user_id;

    -- Check if global admin
    IF current_user_role IN ('global_admin', 'global_quality_admin') THEN
        RETURN TRUE;
    END IF;

    -- Check if lab quality manager viewing same lab
    IF current_user_role = 'lab_quality_manager'
       AND current_user_lab_id = target_profile_lab_id
       AND current_user_lab_id IS NOT NULL THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Similarly optimize the update check
CREATE OR REPLACE FUNCTION can_update_profile(profile_user_id UUID, target_role TEXT, target_lab_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_user_id UUID;
    current_user_role TEXT;
    current_user_lab_id UUID;
BEGIN
    current_user_id := auth.uid();

    -- Quick check: updating own profile
    IF current_user_id = profile_user_id THEN
        RETURN TRUE;
    END IF;

    -- Single query to get current user info
    SELECT qc_role, laboratory_id
    INTO current_user_role, current_user_lab_id
    FROM profiles
    WHERE id = current_user_id;

    -- Global admin can update anyone
    IF current_user_role IN ('global_admin', 'global_quality_admin') THEN
        RETURN TRUE;
    END IF;

    -- Lab quality manager can update certain roles in their lab
    IF current_user_role = 'lab_quality_manager'
       AND current_user_lab_id = target_lab_id
       AND current_user_lab_id IS NOT NULL
       AND target_role IN ('lab_personnel', 'lab_finance_manager') THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view profiles based on role" ON profiles;
DROP POLICY IF EXISTS "Users can update profiles based on role" ON profiles;

-- Create optimized SELECT policy
CREATE POLICY "Users can view profiles based on role"
ON profiles
FOR SELECT
TO public
USING (can_view_profile(id));

-- Create optimized UPDATE policy
CREATE POLICY "Users can update profiles based on role"
ON profiles
FOR UPDATE
TO public
USING (can_update_profile(id, qc_role, laboratory_id))
WITH CHECK (can_update_profile(id, qc_role, laboratory_id));

-- Add comments
COMMENT ON FUNCTION can_view_profile(UUID) IS
'Optimized single-query function to check if user can view a profile. Reduces RLS overhead from 3-4 queries to 1.';

COMMENT ON FUNCTION can_update_profile(UUID, TEXT, UUID) IS
'Optimized single-query function to check if user can update a profile. Reduces RLS overhead from 3-4 queries to 1.';

COMMENT ON POLICY "Users can view profiles based on role" ON profiles IS
'Optimized policy using single-query function. Much faster on production due to reduced network round trips.';

COMMENT ON POLICY "Users can update profiles based on role" ON profiles IS
'Optimized policy using single-query function. Much faster on production due to reduced network round trips.';
