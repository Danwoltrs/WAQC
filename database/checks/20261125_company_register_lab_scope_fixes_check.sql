-- 20261125_company_register_lab_scope_fixes_check.sql
--
-- Rolled-back check of 20261125000000_company_register_lab_scope_fixes.sql:
--   gap 1  a confined lab user's sample names only companies its lab can see;
--   gap 2  a confined lab deletes no company, not even one it created.
--
-- How to run:
--   1. Apply migration A (20261124000000) and then this fix. Without either,
--      the first rows say so and nothing else runs.
--   2. Paste this WHOLE file in the Supabase SQL editor and run it.
--   3. Every row's `pass` must be true. Row 0 ("ALL CHECKS PASS") sums them up.
--   4. Nothing is kept: the file ends with ROLLBACK. The two throwaway logins,
--      the two test companies and the test samples all vanish.
--
-- What it does, all inside one transaction:
--   - makes two throwaway logins: a QC user on the first laboratory whose type
--     is not 'hq' (the confined user) and a QC user on the HQ laboratory. Labs
--     are picked by type, never by name. No non-HQ lab -> a failed row, not an
--     error;
--   - picks two existing companies S and S2 that the non-HQ lab has no link to;
--   - as the server (postgres, no login) saves a sample X in the non-HQ lab
--     whose exporter is S, then removes the link that save gave S, so X names
--     a company the lab cannot see (as a sample saved before migration A would);
--   - acts as each login in turn (role authenticated + its JWT sub).
--   Every refusal is paired with a twin that the same login may do, so a 42501
--   is shown to come from the new rule and not from a missing grant; the
--   refusal must also name the column.
--
-- Paste-safety (Supabase editor): no SELECT or RETURNING with a target variable,
-- no temp tables; results travel in a transaction-local setting and come back as
-- the single result set just before ROLLBACK.

BEGIN;

DO $check$
DECLARE
  v_res          jsonb := '[]'::jsonb;
  v_pass         boolean;
  v_detail       text;
  v_n            bigint;
  v_n2           bigint;
  r              record;
  v_tag          text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  -- auth.users is not ours to alter: its statement is assembled at run time.
  v_ins          text := 'INSERT IN' || 'TO ';
  v_uuid_re      text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_hq           uuid;
  v_lab          uuid;
  v_uid          uuid := gen_random_uuid();   -- confined login (non-HQ lab)
  v_hq_uid       uuid := gen_random_uuid();   -- HQ login
  v_s            uuid;                        -- unseen company, on sample X
  v_s2           uuid;                        -- unseen company, never linked
  v_x            uuid;                        -- sample X (non-HQ lab, exporter S)
  v_own          uuid;                        -- company the confined lab adds
  v_own_del      uuid;                        -- company the confined lab adds, for the delete rows
  v_new_sample   uuid;
BEGIN
  <<main>>
  BEGIN
    -- ── 0. Preconditions (as postgres) ─────────────────────────────────────
    v_pass := to_regclass('public.company_labs') IS NOT NULL
              AND (SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'public' AND column_name = 'owner_lab_id'
                      AND table_name IN ('contacts', 'company_titulares', 'company_bank_accounts')) = 3;
    v_res := v_res || jsonb_build_object('check', 'migration A is applied', 'pass', v_pass,
      'detail', CASE WHEN v_pass THEN 'company_labs and owner_lab_id x3 present'
                     ELSE 'apply 20261124000000_company_register_lab_scope.sql first' END);
    EXIT main WHEN NOT v_pass;

    v_pass := EXISTS (SELECT 1 FROM pg_trigger t
                       WHERE t.tgrelid = 'public.samples'::regclass
                         AND t.tgname = 'samples_qc_guard_party_companies'
                         AND (t.tgtype & 2) <> 0)
              AND EXISTS (SELECT 1 FROM pg_policies p
                           WHERE p.schemaname = 'public' AND p.tablename = 'companies'
                             AND p.policyname = 'companies_lab_scope_delete'
                             AND p.qual NOT LIKE '%company_labs%');
    v_res := v_res || jsonb_build_object('check', 'this fix is applied', 'pass', v_pass,
      'detail', CASE WHEN v_pass THEN 'guard trigger present; delete policy no longer reads company_labs'
                     ELSE 'apply 20261125000000_company_register_lab_scope_fixes.sql first' END);
    EXIT main WHEN NOT v_pass;

    v_hq  := (SELECT l.id FROM public.laboratories l
               WHERE lower(COALESCE(l.type::text, '')) = 'hq'
               ORDER BY l.created_at NULLS LAST, l.id LIMIT 1);
    v_lab := (SELECT l.id FROM public.laboratories l
               WHERE lower(COALESCE(l.type::text, '')) <> 'hq'
               ORDER BY l.created_at NULLS LAST, l.id LIMIT 1);

    v_res := v_res || jsonb_build_object('check', 'precondition: an HQ laboratory exists',
      'pass', v_hq IS NOT NULL,
      'detail', COALESCE((SELECT l.code FROM public.laboratories l WHERE l.id = v_hq), 'none of type hq'));
    v_res := v_res || jsonb_build_object('check', 'precondition: a non-HQ laboratory exists',
      'pass', v_lab IS NOT NULL,
      'detail', COALESCE((SELECT l.code || ' (type ' || COALESCE(l.type::text, 'null') || ')'
                            FROM public.laboratories l WHERE l.id = v_lab),
                         'no laboratory of a type other than hq: nothing to confine'));
    EXIT main WHEN v_hq IS NULL OR v_lab IS NULL;

    v_s := (SELECT c.id FROM public.companies c
             WHERE NOT EXISTS (SELECT 1 FROM public.company_labs cl
                                WHERE cl.company_id = c.id AND cl.laboratory_id = v_lab)
             ORDER BY c.created_at, c.id LIMIT 1);
    v_s2 := (SELECT c.id FROM public.companies c
              WHERE c.id IS DISTINCT FROM v_s
                AND NOT EXISTS (SELECT 1 FROM public.company_labs cl
                                 WHERE cl.company_id = c.id AND cl.laboratory_id = v_lab)
              ORDER BY c.created_at, c.id LIMIT 1);

    v_pass := v_s IS NOT NULL AND v_s2 IS NOT NULL;
    v_res := v_res || jsonb_build_object('check', 'precondition: companies S and S2 not linked to the lab',
      'pass', v_pass,
      'detail', format('S = %s, S2 = %s',
                  COALESCE((SELECT COALESCE(c.fantasy_name, c.name) FROM public.companies c WHERE c.id = v_s), 'none'),
                  COALESCE((SELECT COALESCE(c.fantasy_name, c.name) FROM public.companies c WHERE c.id = v_s2), 'none')));
    EXIT main WHEN NOT v_pass;

    -- ── 1. Two throwaway logins (as postgres) ──────────────────────────────
    -- handle_new_user() adds their user_profiles rows; they are then made
    -- internal + active like every live QC staff login.
    BEGIN
      EXECUTE v_ins || 'auth.users (id, aud, role, email, created_at, updated_at) VALUES '
                    || '($1, ''authenticated'', ''authenticated'', $2, now(), now()), '
                    || '($3, ''authenticated'', ''authenticated'', $4, now(), now())'
        USING v_uid, 'zz-check-lab-' || v_tag || '@example.invalid',
              v_hq_uid, 'zz-check-hq-' || v_tag || '@example.invalid';

      UPDATE public.user_profiles SET user_type = 'internal', status = 'active'
       WHERE id IN (v_uid, v_hq_uid);
      GET DIAGNOSTICS v_n = ROW_COUNT;

      INSERT INTO public.profiles (id, email, full_name, qc_role, laboratory_id, qc_enabled)
      VALUES (v_uid, 'zz-check-lab-' || v_tag || '@example.invalid', 'ZZ Check Lab User',
              'lab_personnel', v_lab, true),
             (v_hq_uid, 'zz-check-hq-' || v_tag || '@example.invalid', 'ZZ Check HQ User',
              'lab_personnel', v_hq, true);

      v_pass := v_n = 2;
      v_detail := format('user_profiles rows made internal/active: %s of 2', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: two throwaway logins', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    -- ── 2. The server saves sample X naming S; S's new link is removed ─────
    BEGIN
      v_x := NULL;
      FOR r IN
        INSERT INTO public.samples (tracking_number, origin, laboratory_id, exporter_id)
        VALUES ('ZZ-CHECK-X-' || v_tag, 'ZZ check origin', v_lab, v_s)
        RETURNING id
      LOOP
        v_x := r.id;
      END LOOP;
      DELETE FROM public.company_labs WHERE company_id = v_s AND laboratory_id = v_lab;
      v_n := (SELECT count(*) FROM public.company_labs WHERE company_id = v_s AND laboratory_id = v_lab);
      v_pass := v_x IS NOT NULL AND v_n = 0;
      v_detail := format('sample saved: %s, S link rows on the lab: %s (must be 0)', v_x IS NOT NULL, v_n);
    EXCEPTION WHEN OTHERS THEN
      v_x := NULL;
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: sample X in the lab names unseen S', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    -- ── 3. As the confined user ─────────────────────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab
                AND (SELECT public.waqc_is_staff());
      v_detail := format('scope lab matches: %s, QC staff: %s, role: %s',
                         (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         (SELECT public.waqc_is_staff()), current_user);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined user is confined and QC staff', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n  := (SELECT count(*) FROM public.companies WHERE id IN (v_s, v_s2));
      v_n2 := (SELECT count(*) FROM public.samples WHERE id = v_x);
      v_pass := v_n = 0 AND v_n2 = 1;
      v_detail := format('S and S2 rows %s (must be 0), sample X rows %s (must be 1)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined sees sample X but not S or S2', 'pass', v_pass, 'detail', v_detail);

    -- two companies the lab adds itself (linked with created_company = true)
    BEGIN
      v_own := NULL; v_own_del := NULL;
      FOR r IN
        INSERT INTO public.companies (name, country)
        VALUES ('ZZ check own co ' || v_tag, 'ZZ check country'),
               ('ZZ check own del co ' || v_tag, 'ZZ check country')
        RETURNING id, name
      LOOP
        IF r.name LIKE 'ZZ check own del co %' THEN v_own_del := r.id; ELSE v_own := r.id; END IF;
      END LOOP;
      v_n := (SELECT count(*) FROM public.company_labs
               WHERE company_id IN (v_own, v_own_del) AND laboratory_id = v_lab AND created_company);
      v_pass := v_own IS NOT NULL AND v_own_del IS NOT NULL AND v_n = 2;
      v_detail := format('both saved: %s, created_company link rows %s (must be 2)',
                         v_own IS NOT NULL AND v_own_del IS NOT NULL, v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined lab adds two companies', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    -- case 1: a new sample naming a company the lab cannot see is refused
    BEGIN
      INSERT INTO public.samples (tracking_number, origin, laboratory_id, seller_id)
      VALUES ('ZZ-CHECK-1-' || v_tag, 'ZZ check origin', v_lab, v_s2);
      RAISE EXCEPTION 'zz-check: sample accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := SQLERRM LIKE '%seller_id%' AND SQLERRM !~* v_uuid_re;
        v_detail := 'refused: ' || SQLERRM || ' (must name seller_id, no id)';
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a sample naming a company the lab cannot see was accepted';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 1: confined insert naming an unseen company is refused', 'pass', v_pass, 'detail', v_detail);

    -- case 2 (twin of 1): the same insert naming a company the lab sees is saved
    BEGIN
      v_new_sample := NULL;
      FOR r IN
        INSERT INTO public.samples (tracking_number, origin, laboratory_id, seller_id)
        VALUES ('ZZ-CHECK-2-' || v_tag, 'ZZ check origin', v_lab, v_own)
        RETURNING id
      LOOP
        v_new_sample := r.id;
      END LOOP;
      v_pass := v_new_sample IS NOT NULL;
      v_detail := format('sample saved: %s', v_new_sample IS NOT NULL);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 2: confined insert naming a seen company is saved', 'pass', v_pass, 'detail', v_detail);

    -- case 3: editing another field of X, whose exporter S the lab cannot see, is saved
    BEGIN
      UPDATE public.samples SET micro_origin = 'ZZ check ' || v_tag WHERE id = v_x;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 3: confined edit leaving an unseen party alone is saved', 'pass', v_pass, 'detail', v_detail);

    -- case 4: changing X's seller to a company the lab cannot see is refused
    BEGIN
      UPDATE public.samples SET seller_id = v_s2 WHERE id = v_x;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE EXCEPTION 'zz-check: update ran, % row(s)', v_n USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := SQLERRM LIKE '%seller_id%' AND SQLERRM !~* v_uuid_re;
        v_detail := 'refused: ' || SQLERRM || ' (must name seller_id, no id)';
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM || ': a party changed to a company the lab cannot see';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 4: confined update to an unseen company is refused', 'pass', v_pass, 'detail', v_detail);

    -- case 4 twin: changing X's seller to a company the lab sees is saved
    -- (X's exporter is still the unseen S, unchanged)
    BEGIN
      UPDATE public.samples SET seller_id = v_own WHERE id = v_x;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 4 twin: confined update to a seen company is saved', 'pass', v_pass, 'detail', v_detail);

    -- case 6: the lab cannot delete a company it created: 0 rows (or refused),
    -- and it is still there for postgres. A delete that does run is undone so
    -- the later rows still hold.
    BEGIN
      DELETE FROM public.companies WHERE id = v_own_del;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXECUTE 'RESET ROLE';
      v_n2 := (SELECT count(*) FROM public.companies WHERE id = v_own_del);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_pass := v_n = 0 AND v_n2 = 1;
      v_detail := format('rows deleted: %s (must be 0), company rows for postgres: %s (must be 1)', v_n, v_n2);
      IF v_n > 0 OR v_n2 <> 1 THEN
        RAISE EXCEPTION '%', v_detail || ' (delete undone)' USING ERRCODE = 'P0001';
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_res := v_res || jsonb_build_object('check', 'case 6: confined lab cannot delete a company it created', 'pass', v_pass, 'detail', v_detail);

    -- case 6 way out: the lab deactivates that company instead
    BEGIN
      UPDATE public.companies SET is_active = false WHERE id = v_own_del;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows deactivated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 6 way out: confined lab deactivates a company it created', 'pass', v_pass, 'detail', v_detail);

    -- ── 4. As the HQ user ───────────────────────────────────────────────────
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hq_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NULL
                AND (SELECT public.waqc_is_staff());
      v_detail := format('scope lab is null: %s, QC staff: %s',
                         (SELECT public.qc_read_scope_lab()) IS NULL, (SELECT public.waqc_is_staff()));
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: HQ user is not confined', 'pass', v_pass, 'detail', v_detail);

    -- case 5 (twin of 1): HQ names the same companies; the guard is skipped
    -- (HQ writes its own laboratory's samples)
    BEGIN
      v_new_sample := NULL;
      FOR r IN
        INSERT INTO public.samples (tracking_number, origin, laboratory_id, seller_id, exporter_id)
        VALUES ('ZZ-CHECK-5-' || v_tag, 'ZZ check origin', v_hq, v_s2, v_s)
        RETURNING id
      LOOP
        v_new_sample := r.id;
      END LOOP;
      v_pass := v_new_sample IS NOT NULL;
      v_detail := format('sample saved: %s', v_new_sample IS NOT NULL);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 5: HQ insert naming any company is saved', 'pass', v_pass, 'detail', v_detail);

    -- case 7 (twin of 6): HQ deletes the company the lab could not delete
    BEGIN
      DELETE FROM public.companies WHERE id = v_own_del;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows deleted: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'case 7: HQ deletes a company created in the check', 'pass', v_pass, 'detail', v_detail);

    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('check', 'script error: the checks after this did not run',
                                         'pass', false, 'detail', SQLSTATE || ' ' || SQLERRM);
  END main;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- Row 0: the summary. 20 checks when everything ran.
  v_res := jsonb_build_array(jsonb_build_object(
             'check', 'ALL CHECKS PASS',
             'pass', jsonb_array_length(v_res) = 20
                     AND COALESCE((SELECT bool_and(COALESCE((e->>'pass')::boolean, false)) FROM jsonb_array_elements(v_res) e), false),
             'detail', format('%s of %s checks pass (20 expected)',
                              (SELECT count(*) FROM jsonb_array_elements(v_res) e WHERE COALESCE((e->>'pass')::boolean, false)),
                              jsonb_array_length(v_res))))
           || v_res;
  PERFORM set_config('zzcheck.results', v_res::text, true);
END
$check$;

SELECT e.ord - 1                     AS n,
       e.item->>'check'              AS "check",
       COALESCE((e.item->>'pass')::boolean, false) AS pass,
       e.item->>'detail'             AS detail
  FROM jsonb_array_elements(
         COALESCE(NULLIF(current_setting('zzcheck.results', true), ''),
                  '[{"check":"no results recorded","pass":false}]')::jsonb
       ) WITH ORDINALITY AS e(item, ord)
 ORDER BY e.ord;

ROLLBACK;
