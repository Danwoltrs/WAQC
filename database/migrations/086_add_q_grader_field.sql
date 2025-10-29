-- Migration 086: Add Q Grader field to profiles table
-- Date: 2025-10-29
-- Purpose: Track Q Grader certification for quality assessors

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_q_grader BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN profiles.is_q_grader IS 'Designates if user is a certified Q Grader (SCA certification)';

-- Create index for Q Grader queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_q_grader ON profiles(is_q_grader) WHERE is_q_grader = true;
