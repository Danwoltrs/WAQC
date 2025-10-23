-- Fix foreign keys to point to profiles instead of auth.users
-- Drop existing foreign keys
ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_user_id_fkey;
ALTER TABLE access_requests DROP CONSTRAINT IF EXISTS access_requests_processed_by_fkey;

-- Recreate foreign keys to point to profiles
ALTER TABLE access_requests
ADD CONSTRAINT access_requests_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE access_requests
ADD CONSTRAINT access_requests_processed_by_fkey
FOREIGN KEY (processed_by) REFERENCES profiles(id) ON DELETE SET NULL;
