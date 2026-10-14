-- handle_new_user (on auth.users, fires for EVERY new login on the shared
-- database, sys's included): stop creating WAQC profiles for strangers.
--
-- Before: any sign-in without a WAQC invitation got a lab_personnel profile,
-- which much of WAQC treats as staff. Now a WAQC profile is written only for
--   * a pending staff invitation (role not client / supplier / buyer), or
--   * an @wolthers.com email (unchanged defaults).
-- Client logins come from portal_invitations and never get a WAQC profile.
--
-- The WAQC profile part runs in its own BEGIN ... EXCEPTION block: if it
-- fails, it is skipped with a warning (ensureWaqcProfile creates the profile
-- at first sign-in) and can never roll back the user_profiles row below.
--
-- The user_profiles insert is unchanged on purpose: external / pending for
-- strangers is how sys denies them by default (2026-07-07).
--
-- No enum casts: the live profiles.qc_role is character varying.
-- Paste-safe: assignments use := and a FOR loop, no select-to-variable.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  invitation_record public.user_invitations%ROWTYPE;
  has_staff_invitation boolean := false;
  default_lab_id uuid;
  is_wolthers_email boolean;
  is_admin_email boolean;
BEGIN
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';
  is_admin_email := lower(NEW.email) IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com');

  -- WAQC profile: its own block, so nothing here can undo the user_profiles row.
  BEGIN
    default_lab_id := (SELECT l.id FROM public.laboratories l WHERE l.code = 'SANTOS_HQ' LIMIT 1);

    FOR invitation_record IN
      SELECT *
      FROM public.user_invitations ui
      WHERE lower(ui.email) = lower(NEW.email)
        AND ui.status = 'pending'
        AND ui.expires_at > now()
        AND ui.qc_role NOT IN ('client', 'supplier', 'buyer')
      ORDER BY ui.created_at DESC
      LIMIT 1
    LOOP
      has_staff_invitation := true;
    END LOOP;

    IF has_staff_invitation THEN
      INSERT INTO public.profiles (
        id, email, first_name, last_name, full_name,
        qc_role, laboratory_id, is_cupper, is_q_grader,
        qc_enabled, is_global_admin, created_at, updated_at
      )
      VALUES (
        NEW.id, NEW.email,
        COALESCE(invitation_record.first_name, ''),
        COALESCE(invitation_record.last_name, ''),
        COALESCE(NULLIF(btrim(COALESCE(invitation_record.first_name, '') || ' ' || COALESCE(invitation_record.last_name, '')), ''),
                 split_part(NEW.email, '@', 1)),
        invitation_record.qc_role,
        COALESCE(invitation_record.laboratory_id, default_lab_id),
        COALESCE(invitation_record.is_cupper, FALSE),
        COALESCE(invitation_record.is_q_grader, FALSE),
        COALESCE(invitation_record.qc_enabled, TRUE),
        invitation_record.qc_role IN ('global_admin', 'global_quality_admin'),
        now(), now()
      )
      ON CONFLICT (id) DO NOTHING;

      UPDATE public.user_invitations
      SET status = 'accepted', accepted_at = now(), updated_at = now()
      WHERE id = invitation_record.id;
    ELSIF is_wolthers_email THEN
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
        default_lab_id,
        TRUE,
        is_admin_email,
        now(), now()
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: no WAQC profile for % (%); ensureWaqcProfile creates it at first sign-in', NEW.email, SQLERRM;
  END;

  -- Unchanged from live: sys's default-deny row for strangers.
  INSERT INTO public.user_profiles (id, full_name, email, status, permissions, department_ids, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    lower(NEW.email),
    'pending',
    '{}',
    '{}',
    CASE WHEN is_wolthers_email THEN 'internal' ELSE 'external' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$function$;

-- Verification: both true once the new body is live.
SELECT position('Unchanged from live' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS rewritten,
       position('its own block' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS profile_block_isolated;
