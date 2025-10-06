-- Enable QC access for the currently authenticated user
-- Run this in your Supabase SQL editor

-- First, check what users exist and their current QC status
SELECT id, email, full_name, qc_enabled, qc_role, laboratory_id 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if Santos HQ laboratory exists
SELECT id, name, location FROM laboratories WHERE id = '550e8400-e29b-41d4-a716-446655440001';

-- Enable QC for the most recently created user (typically the one who just logged in)
-- You can replace this with a specific email if needed
UPDATE profiles 
SET 
  qc_enabled = true,
  qc_role = 'global_admin',
  laboratory_id = '550e8400-e29b-41d4-a716-446655440001' -- Santos HQ
WHERE id = (
  SELECT id FROM profiles 
  ORDER BY created_at DESC 
  LIMIT 1
);

-- Alternative: Enable QC for a specific email
-- UPDATE profiles 
-- SET 
--   qc_enabled = true,
--   qc_role = 'global_admin',
--   laboratory_id = '550e8400-e29b-41d4-a716-446655440001'
-- WHERE email = 'your-email@domain.com';

-- Verify the update
SELECT id, email, full_name, qc_enabled, qc_role, laboratory_id 
FROM profiles 
WHERE qc_enabled = true;