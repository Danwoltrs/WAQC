-- Migration: Reset tracking number sequence after bulk sample deletion
-- Date: 2025-11-27
-- Purpose: Reset samples_tracking_number_seq to 1 to allow clean slate sample creation

-- Reset the tracking number sequence to start from 1
ALTER SEQUENCE samples_tracking_number_seq RESTART WITH 1;

-- Verification query
SELECT
  'Sequence reset complete' as status,
  last_value as current_sequence_value,
  is_called
FROM samples_tracking_number_seq;
