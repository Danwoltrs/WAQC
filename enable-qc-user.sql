-- Enable QC access for daniel@wolthers.com
-- Run this in your Supabase SQL editor

-- First, check if the user exists
SELECT id, email, full_name FROM profiles WHERE email = 'daniel@wolthers.com';

-- Enable QC for daniel@wolthers.com and make them Global Admin
UPDATE profiles 
SET 
  qc_enabled = true,
  qc_role = 'global_admin',
  laboratory_id = '550e8400-e29b-41d4-a716-446655440001' -- Santos HQ
WHERE email = 'daniel@wolthers.com';

-- Verify the update
SELECT id, email, full_name, qc_enabled, qc_role, laboratory_id 
FROM profiles 
WHERE email = 'daniel@wolthers.com';

-- Check that Santos HQ laboratory exists
SELECT id, name, location FROM laboratories WHERE id = '550e8400-e29b-41d4-a716-446655440001';