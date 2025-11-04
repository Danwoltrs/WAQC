-- Diagnostic query to check all lab users and their cupper status
-- Run this to see who is missing the cupper flags

SELECT
  p.id,
  p.email,
  p.full_name,
  p.qc_role,
  p.qc_enabled,
  p.is_cupper,
  p.is_q_grader,
  l.name as lab_name,
  l.code as lab_code
FROM profiles p
LEFT JOIN laboratories l ON p.laboratory_id = l.id
WHERE p.qc_enabled = true
ORDER BY l.name, p.full_name;

-- To see only users in a specific lab (replace 'Lab Code' with actual lab code like 'SAN', 'BVA', etc.):
-- WHERE p.qc_enabled = true
-- AND l.code = 'SAN'  -- or 'BVA', 'GUA', 'PER'

-- Example fix: To make all lab personnel in a specific lab available as cuppers
-- (Uncomment and adjust as needed)

-- UPDATE profiles
-- SET is_cupper = true
-- WHERE laboratory_id = (SELECT id FROM laboratories WHERE code = 'SAN')  -- Change 'SAN' to your lab code
-- AND qc_enabled = true
-- AND qc_role = 'lab_personnel';

-- OR to update a specific user:
-- UPDATE profiles
-- SET is_cupper = true
-- WHERE email = 'user@example.com';
