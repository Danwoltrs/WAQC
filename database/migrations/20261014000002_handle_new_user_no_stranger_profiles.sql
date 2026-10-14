-- handle_new_user (on auth.users, fires for EVERY new login on the shared
-- database, sys's included): stop creating WAQC profiles for strangers.
--
-- RUN database/checks/20261014000002_precheck.sql FIRST. If the live body
-- differs from this file's base, stop and tell the controller before pasting.
--
-- Before: any sign-in without a WAQC invitation got a lab_personnel profile,
-- which much of WAQC treats as staff. Now a WAQC profile is written only for
--   * the NEWEST pending, unexpired invitation for the email, when that
--     invitation's role is a staff role (not null, not client / supplier /
--     buyer). A later client re-invite therefore overrides an older staff
--     invite, or
--   * an @wolthers.com email (unchanged defaults).
-- Client logins come from portal_invitations and never get a WAQC profile.
--
-- The WAQC profile part runs in its own BEGIN ... EXCEPTION block: if it
-- fails, it is skipped with a warning (ensureWaqcProfile creates the profile
-- at first sign-in) and can never roll back the user_profiles row below.
-- The invitation bookkeeping update has a nested block of its own, so a
-- failure there never loses the staff profile.
--
-- The user_profiles insert is unchanged for EVERYONE, staff invitees
-- included: external / pending for strangers is how sys denies them by
-- default (2026-07-07), and a login with no user_profiles row would count as
-- "not external" to sys's permissive *_internal_all policies. WAQC decides
-- staff from profiles.qc_enabled (see waqc_access_kind), not from that row.
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
  has_invitation boolean := false;
  default_lab_id uuid;
  is_wolthers_email boolean;
  is_admin_email boolean;
BEGIN
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';
  is_admin_email := lower(btrim(NEW.email)) IN ('daniel@wolthers.com', 'anderson@wolthers.com', 'edgar@wolthers.com');

  -- WAQC profile: its own block, so nothing here can undo the user_profiles row.
  BEGIN
    default_lab_id := (SELECT l.id FROM public.laboratories l WHERE l.code = 'SANTOS_HQ' LIMIT 1);

    -- Newest pending, unexpired invitation for this email, any role.
    FOR invitation_record IN
      SELECT *
      FROM public.user_invitations ui
      WHERE lower(btrim(ui.email)) = lower(btrim(NEW.email))
        AND ui.status = 'pending'
        AND ui.expires_at > now()
      ORDER BY ui.created_at DESC NULLS LAST, ui.id DESC
      LIMIT 1
    LOOP
      has_invitation := true;
    END LOOP;

    IF has_invitation
       AND invitation_record.qc_role IS NOT NULL
       AND invitation_record.qc_role NOT IN ('client', 'supplier', 'buyer') THEN
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

      -- Bookkeeping only: a failure here must never lose the staff profile.
      BEGIN
        UPDATE public.user_invitations
        SET status = 'accepted', accepted_at = now(), updated_at = now()
        WHERE id = invitation_record.id;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'handle_new_user: could not mark invitation % accepted for %: %', invitation_record.id, NEW.email, SQLERRM;
      END;
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

  -- Unchanged from live: sys's default-deny row, for every new user.
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

-- Verification: rewritten, profile_block_isolated, prosecdef and proconfig
-- (search_path pinned) should all be true / set, and trigger_bound true.
SELECT
  position('Unchanged from live' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS rewritten,
  position('its own block' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 AS profile_block_isolated,
  p.prosecdef,
  p.proconfig,
  EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass
      AND t.tgfoid = 'public.handle_new_user'::regproc
      AND t.tgenabled <> 'D'
  ) AS trigger_bound
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'handle_new_user';
