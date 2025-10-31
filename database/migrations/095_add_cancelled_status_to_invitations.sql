-- Migration 095: Add 'cancelled' as valid status for user_invitations
-- Date: 2025-10-31
-- Purpose: Allow invitations to be cancelled by admins

-- First, check what status values currently exist
DO $$
DECLARE
    invalid_statuses TEXT;
BEGIN
    -- Get any status values that aren't in our expected list
    SELECT string_agg(DISTINCT status, ', ')
    INTO invalid_statuses
    FROM user_invitations
    WHERE status NOT IN ('pending', 'accepted', 'expired', 'cancelled');

    -- If there are invalid statuses, log them
    IF invalid_statuses IS NOT NULL THEN
        RAISE NOTICE 'Found invalid status values that will be updated: %', invalid_statuses;
    END IF;
END $$;

-- Update any non-standard status values to 'pending'
-- This handles any legacy data from trips.wolthers.com or other sources
UPDATE user_invitations
SET status = 'pending'
WHERE status NOT IN ('pending', 'accepted', 'expired', 'cancelled');

-- Drop the existing check constraint if it exists
ALTER TABLE user_invitations
DROP CONSTRAINT IF EXISTS user_invitations_status_check;

-- Add new check constraint with 'cancelled' included
ALTER TABLE user_invitations
ADD CONSTRAINT user_invitations_status_check
CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'));

COMMENT ON CONSTRAINT user_invitations_status_check ON user_invitations IS
'Validates invitation status values: pending (newly created), accepted (user signed up), expired (past expiration date), cancelled (manually cancelled by admin)';
