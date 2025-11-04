-- Migration 093: Add performance indexes for profiles table
-- Date: 2025-11-04
-- Purpose: Ensure optimal query performance for profile lookups

-- The id column is already indexed as PRIMARY KEY, but let's ensure
-- other commonly queried columns are also indexed

-- Index for laboratory_id lookups (used in RLS policies and queries)
CREATE INDEX IF NOT EXISTS idx_profiles_laboratory_id
ON profiles(laboratory_id)
WHERE laboratory_id IS NOT NULL;

-- Index for qc_role lookups (used in RLS policies)
CREATE INDEX IF NOT EXISTS idx_profiles_qc_role
ON profiles(qc_role);

-- Composite index for lab manager queries (role + lab)
CREATE INDEX IF NOT EXISTS idx_profiles_role_lab
ON profiles(qc_role, laboratory_id)
WHERE laboratory_id IS NOT NULL;

-- Index for email lookups (used during auth)
CREATE INDEX IF NOT EXISTS idx_profiles_email
ON profiles(email);

-- Add index for global admin checks
CREATE INDEX IF NOT EXISTS idx_profiles_is_global_admin
ON profiles(is_global_admin)
WHERE is_global_admin = true;

-- Comments
COMMENT ON INDEX idx_profiles_laboratory_id IS
'Speeds up lab-based profile queries used in RLS policies and dashboard queries';

COMMENT ON INDEX idx_profiles_qc_role IS
'Speeds up role-based filtering in RLS policies';

COMMENT ON INDEX idx_profiles_role_lab IS
'Composite index for lab manager permission checks (role + lab together)';

COMMENT ON INDEX idx_profiles_email IS
'Speeds up email-based user lookups during authentication';

COMMENT ON INDEX idx_profiles_is_global_admin IS
'Partial index for quick global admin checks (only indexes admin rows)';
