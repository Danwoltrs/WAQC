-- Migration: 20260622000002_handle_new_user_company_id.sql
--
-- Replaces the live handle_new_user() trigger function (body captured from
-- prod via pg_get_functiondef on 2026-06-22) and adds client_id mapping from
-- invitation.company_id. This ensures that when a client-role user accepts a
-- portal invitation, their profiles.client_id is set to the inviting company,
-- scoping their portal access to that company.
--
-- Only two lines change relative to the live body:
--   1. `client_id` added to the IF FOUND branch INSERT column list (after laboratory_id)
--   2. `invitation_record.company_id,` added to the matching VALUES list (after invitation_record.laboratory_id)
-- Everything else — the ELSE branch, user_profiles insert, ON CONFLICT clauses,
-- EXCEPTION handler, DECLARE block, and function signature — is unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invitation_record RECORD;
  default_lab_id UUID;
  is_wolthers_email BOOLEAN;
  is_admin_email BOOLEAN;
BEGIN
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';
  is_admin_email := NEW.email IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com');

  SELECT id INTO default_lab_id FROM laboratories WHERE code = 'SANTOS_HQ' LIMIT 1;

  SELECT * INTO invitation_record
  FROM user_invitations
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name,
      qc_role, laboratory_id, client_id, is_cupper, is_q_grader,
      qc_enabled, is_global_admin, created_at, updated_at
    )
    VALUES (
      NEW.id, NEW.email,
      COALESCE(invitation_record.first_name, ''),
      COALESCE(invitation_record.last_name, ''),
      COALESCE(invitation_record.first_name || ' ' || invitation_record.last_name, split_part(NEW.email, '@', 1)),
      COALESCE(invitation_record.qc_role, 'lab_personnel'),
      invitation_record.laboratory_id,
      invitation_record.company_id,
      COALESCE(invitation_record.is_cupper, FALSE),
      COALESCE(invitation_record.is_q_grader, FALSE),
      COALESCE(invitation_record.qc_enabled, TRUE),
      invitation_record.qc_role IN ('global_admin', 'global_quality_admin'),
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE user_invitations
    SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
    WHERE id = invitation_record.id;
  ELSE
    INSERT INTO public.profiles (
      id, email, first_name, last_name, full_name,
      qc_role, laboratory_id, qc_enabled, is_global_admin,
      created_at, updated_at
    )
    VALUES (
      NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      CASE WHEN is_admin_email THEN 'global_admin' ELSE 'lab_personnel' END,
      CASE WHEN is_wolthers_email THEN default_lab_id ELSE NULL END,
      is_wolthers_email,
      is_admin_email,
      NOW(), NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Also create user_profiles row for trading app
  INSERT INTO public.user_profiles (id, full_name, email, status, permissions, department_ids, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    LOWER(NEW.email),
    'active',
    '{}',
    '{}',
    'internal'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$function$
