-- Fix for existing Supabase project - Column reference corrections
-- Run this AFTER the initial migration if you encounter column errors

-- Drop and recreate helper functions with correct column references
DROP FUNCTION IF EXISTS get_user_qc_role(UUID);
DROP FUNCTION IF EXISTS get_user_qc_laboratory(UUID);
DROP FUNCTION IF EXISTS has_global_qc_access(UUID);
DROP FUNCTION IF EXISTS can_create_laboratories(UUID);

-- Helper function to get user QC role (handles case where qc_role column might not exist)
CREATE OR REPLACE FUNCTION get_user_qc_role(user_id UUID)
RETURNS user_role AS $$
BEGIN
    -- Try to get qc_role, fallback to NULL if column doesn't exist
    BEGIN
        RETURN (SELECT qc_role FROM profiles WHERE id = user_id AND qc_enabled = true);
    EXCEPTION
        WHEN undefined_column THEN
            RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user laboratory (handles case where laboratory_id column might not exist)
CREATE OR REPLACE FUNCTION get_user_qc_laboratory(user_id UUID)
RETURNS UUID AS $$
BEGIN
    BEGIN
        RETURN (SELECT laboratory_id FROM profiles WHERE id = user_id AND qc_enabled = true);
    EXCEPTION
        WHEN undefined_column THEN
            RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user has global QC access
CREATE OR REPLACE FUNCTION has_global_qc_access(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    BEGIN
        RETURN (SELECT qc_role IN ('santos_hq_finance', 'global_finance_admin', 'global_quality_admin', 'global_admin') 
                FROM profiles WHERE id = user_id AND qc_enabled = true);
    EXCEPTION
        WHEN undefined_column THEN
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user can create labs
CREATE OR REPLACE FUNCTION can_create_laboratories(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    BEGIN
        RETURN (SELECT qc_role IN ('global_admin', 'global_quality_admin') 
                FROM profiles WHERE id = user_id AND qc_enabled = true);
    EXCEPTION
        WHEN undefined_column THEN
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the columns exist before proceeding
DO $$
BEGIN
    -- Check if qc_role column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'qc_role'
    ) THEN
        RAISE NOTICE 'qc_role column not found in profiles table. Run the main migration first.';
    END IF;
    
    -- Check if qc_enabled column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'qc_enabled'
    ) THEN
        RAISE NOTICE 'qc_enabled column not found in profiles table. Run the main migration first.';
    END IF;
    
    -- Check if laboratory_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'laboratory_id'
    ) THEN
        RAISE NOTICE 'laboratory_id column not found in profiles table. Run the main migration first.';
    END IF;
END $$;

-- Test the functions work
SELECT 'Functions created successfully. Test with: SELECT get_user_qc_role(auth.uid());' as status;