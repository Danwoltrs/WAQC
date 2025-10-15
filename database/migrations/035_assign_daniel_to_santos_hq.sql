-- Migration 035: Assign Daniel to Santos HQ Laboratory
-- Date: 2025-10-15
-- Purpose: Assign daniel@wolthers.com to Santos HQ lab so he can test lab-specific templates

-- First, get the Santos HQ laboratory ID
DO $$
DECLARE
  v_santos_lab_id UUID;
  v_daniel_user_id UUID;
BEGIN
  -- Find Santos HQ lab
  SELECT id INTO v_santos_lab_id
  FROM laboratories
  WHERE LOWER(name) LIKE '%santos%' AND LOWER(name) LIKE '%hq%'
  LIMIT 1;

  IF v_santos_lab_id IS NULL THEN
    RAISE NOTICE 'Santos HQ laboratory not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Santos HQ lab ID: %', v_santos_lab_id;

  -- Find Daniel's user ID
  SELECT id INTO v_daniel_user_id
  FROM profiles
  WHERE email = 'daniel@wolthers.com';

  IF v_daniel_user_id IS NULL THEN
    RAISE NOTICE 'Daniel profile not found';
    RETURN;
  END IF;

  -- Update Daniel's profile to assign him to Santos HQ
  UPDATE profiles
  SET laboratory_id = v_santos_lab_id
  WHERE id = v_daniel_user_id;

  RAISE NOTICE 'Assigned Daniel to Santos HQ lab';

  -- Verify the update
  SELECT
    p.email,
    p.full_name,
    p.qc_role,
    l.name as laboratory_name
  FROM profiles p
  LEFT JOIN laboratories l ON p.laboratory_id = l.id
  WHERE p.email = 'daniel@wolthers.com';

END;
$$;

SELECT 'Migration 035: Assigned Daniel to Santos HQ' as status;
