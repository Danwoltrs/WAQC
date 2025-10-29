-- Migration 087: Add Q Grader and QC Access fields to user_invitations table
-- Date: 2025-10-29
-- Purpose: Track Q Grader and QC Access settings in invitation workflow

ALTER TABLE user_invitations
ADD COLUMN IF NOT EXISTS is_q_grader BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS qc_enabled BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN user_invitations.is_q_grader IS 'Q Grader certification status for invited user';
COMMENT ON COLUMN user_invitations.qc_enabled IS 'QC Access enabled status for invited user';
