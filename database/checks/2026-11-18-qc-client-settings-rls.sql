-- Why does "Save QC configuration" fail with
--   new row violates row-level security policy for table "qc_client_settings"?
--
-- Runs AS the signed-in user (set the email on the marked line), evaluates every
-- write policy on qc_client_settings for them, and tries the exact upsert the
-- PATCH /api/clients/[id] route makes for Swiss Water. The upsert sits in a
-- block that is always rolled back: nothing is written.
--
-- Paste-safe for the Supabase editor: one implicit transaction, one result row.

SELECT set_config('request.jwt.claims',
  (SELECT json_build_object('sub', u.id::text, 'role', 'authenticated', 'email', u.email)::text
     FROM auth.users u
    WHERE lower(u.email) = 'daniel@wolthers.com'   -- <<< the login used on qc.wolthers.com
    LIMIT 1), true);

SELECT set_config('diag.profile',
  COALESCE((SELECT row_to_json(p)::text FROM (
     SELECT qc_role, qc_enabled, is_global_admin FROM public.profiles
      WHERE id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid) p), 'NO profiles ROW'), true);

SELECT set_config('diag.user_profile',
  COALESCE((SELECT row_to_json(up)::text FROM (
     SELECT status, user_type FROM public.user_profiles
      WHERE id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid) up), 'NO user_profiles ROW'), true);

SELECT set_config('diag.company',
  COALESCE((SELECT c.id::text FROM public.companies c
             WHERE c.fantasy_name ILIKE 'swiss water%' OR c.name ILIKE 'swiss water%'
             ORDER BY c.is_qc_client DESC NULLS LAST LIMIT 1), ''), true);

SELECT set_config('diag.settings_row_exists',
  (EXISTS (SELECT 1 FROM public.qc_client_settings s
            WHERE s.company_id::text = current_setting('diag.company', true)))::text, true);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r record;
  v_ok boolean;
  v_out text := '';
  v_upsert text;
BEGIN
  -- Each write policy's expression, evaluated for this user.
  FOR r IN
    SELECT policyname, permissive, cmd, COALESCE(with_check, qual) AS expr
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'qc_client_settings'
       AND cmd IN ('INSERT', 'UPDATE', 'ALL')
     ORDER BY permissive, cmd, policyname
  LOOP
    BEGIN
      EXECUTE 'SELECT (' || COALESCE(r.expr, 'true') || ')::boolean' INTO v_ok;
      v_out := v_out || format(E'%s | %s | %s | %s\n', r.policyname, r.permissive, r.cmd, COALESCE(v_ok::text, 'null'));
    EXCEPTION WHEN OTHERS THEN
      v_out := v_out || format(E'%s | %s | %s | n/a (%s) | %s\n', r.policyname, r.permissive, r.cmd, SQLERRM, r.expr);
    END;
  END LOOP;
  PERFORM set_config('diag.policies', v_out, true);

  -- The route's upsert, always rolled back.
  BEGIN
    INSERT INTO public.qc_client_settings (company_id)
    VALUES (NULLIF(current_setting('diag.company', true), '')::uuid)
    ON CONFLICT (company_id) DO UPDATE SET company_id = EXCLUDED.company_id;
    RAISE EXCEPTION 'diag_upsert_ok';
  EXCEPTION WHEN OTHERS THEN
    v_upsert := CASE WHEN SQLERRM = 'diag_upsert_ok' THEN 'upsert would SUCCEED' ELSE SQLERRM END;
  END;
  PERFORM set_config('diag.upsert', v_upsert, true);
END $$;

SELECT
  auth.uid()                                  AS uid,
  current_setting('diag.profile', true)       AS profile,
  current_setting('diag.user_profile', true)  AS user_profile,
  public.waqc_is_staff()                      AS waqc_is_staff,
  public.waqc_access_kind()                   AS waqc_access_kind,
  current_setting('diag.company', true)       AS swiss_water_company_id,
  current_setting('diag.settings_row_exists', true) AS settings_row_exists,
  current_setting('diag.upsert', true)        AS upsert_result,
  current_setting('diag.policies', true)      AS write_policies_name_permissive_cmd_result;
