-- A login on sys no longer writes anything on the QC side.
--
-- handle_new_user fires for every new login on the shared database. Its
-- @wolthers.com branch gave each one a lab_personnel QC profile, and that
-- profile fired on_wolthers_profile_created (live only, in no repo), which
-- filed a pending QC access request. So people invited to sys became QC staff
-- and appeared under Users as QC requests.
--
-- This trigger cannot tell which app a login came from, so it now makes a QC
-- profile only for a staff invitation. @wolthers.com staff get theirs when they
-- sign in on qc.wolthers.com (ensureWaqcProfile, from /auth/callback). The
-- invitation branch and the user_profiles row are unchanged.
--
-- Takes no table locks. The foreign-key change that goes with it is in
-- 20261109000001, apart, because it needs exclusive locks on profiles and
-- deadlocked with live traffic when both ran in one paste.
--
-- Paste-safe: one implicit transaction, no select-to-variable.

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
BEGIN
  is_wolthers_email := NEW.email ILIKE '%@wolthers.com';

  -- WAQC profile: its own block, so nothing here can undo the user_profiles row.
  -- Only a staff invitation makes one here; an address alone never does.
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
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: no WAQC profile for % (%); ensureWaqcProfile creates it at first sign-in', NEW.email, SQLERRM;
  END;

  -- sys's default-deny row, for every new user. Statement unchanged from
  -- live; it sits outside any handler, so its failure aborts the sign-up
  -- (fail closed: never a login without a user_profiles row).
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
END;
$function$;

-- Verification: all four true, other_profile_writers empty.
SELECT
  position('lab_personnel' in p.prosrc) = 0 AS wolthers_branch_gone,
  position('invitation_record.qc_role,' in p.prosrc) > 0 AS invitation_branch_kept,
  position('public.user_profiles' in p.prosrc) > 0 AS user_profiles_kept,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'auth.users'::regclass AND t.tgfoid = p.oid AND t.tgenabled <> 'D'
  ) AS trigger_bound,
  (SELECT string_agg(o.proname, ', ')
   FROM pg_proc o
   WHERE o.prokind = 'f'
     AND o.proname <> 'handle_new_user'
     AND o.prosrc ~* '\minsert\s+\w+\s+(public\.)?profiles\M') AS other_profile_writers
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
