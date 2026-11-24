-- 20261124_company_register_lab_scope_check.sql
--
-- Rolled-back check of migration A (20261124000000_company_register_lab_scope.sql):
-- a laboratory sees the companies it added; HQ, global admins and sys see all.
--
-- How to run:
--   1. Apply migration A first. Without it the first row says so and nothing else runs.
--   2. Paste this WHOLE file in the Supabase SQL editor and run it.
--   3. Every row's `pass` must be true. Row 0 ("ALL CHECKS PASS") sums them up.
--   4. Nothing is kept: the file ends with ROLLBACK. The three throwaway logins,
--      the test company, contact, bank account and the two test samples all vanish.
--
-- What it does, all inside one transaction:
--   - makes three throwaway logins: a QC user on the first laboratory whose type
--     is not 'hq' (the confined user), a QC user on the HQ laboratory, and a
--     sys-only login (internal + active, no QC profile, like live sys staff).
--     Labs are picked by type, never by name. No non-HQ lab -> a failed row,
--     not an error;
--   - picks two existing companies S and S2 that the non-HQ lab has no link to
--     (S has at least one contact owned by sys/HQ);
--   - acts as each login in turn (role authenticated + its JWT sub) and checks
--     what it may read and write, one row per check.
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
  v_hq           uuid;
  v_lab          uuid;
  v_uid          uuid := gen_random_uuid();   -- confined login (non-HQ lab)
  v_hq_uid       uuid := gen_random_uuid();   -- HQ login
  v_sys_uid      uuid := gen_random_uuid();   -- sys-only login (no QC profile)
  v_s            uuid;
  v_s_contact    uuid;
  v_s2           uuid;
  v_new          uuid;
  v_new_contact  uuid;
  v_bank         uuid;
  v_bank_owner   uuid;
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
             WHERE EXISTS (SELECT 1 FROM public.contacts k
                            WHERE k.company_id = c.id AND k.owner_lab_id IS NULL)
               AND NOT EXISTS (SELECT 1 FROM public.company_labs cl
                                WHERE cl.company_id = c.id AND cl.laboratory_id = v_lab)
             ORDER BY c.created_at, c.id LIMIT 1);
    v_s_contact := (SELECT k.id FROM public.contacts k
                     WHERE k.company_id = v_s AND k.owner_lab_id IS NULL
                     ORDER BY k.created_at, k.id LIMIT 1);
    v_s2 := (SELECT c.id FROM public.companies c
              WHERE c.id <> v_s
                AND NOT EXISTS (SELECT 1 FROM public.company_labs cl
                                 WHERE cl.company_id = c.id AND cl.laboratory_id = v_lab)
              ORDER BY c.created_at, c.id LIMIT 1);

    v_pass := v_s IS NOT NULL AND v_s_contact IS NOT NULL AND v_s2 IS NOT NULL;
    v_res := v_res || jsonb_build_object('check', 'precondition: unlinked companies S (with a contact) and S2',
      'pass', v_pass,
      'detail', format('S = %s, S2 = %s',
                  COALESCE((SELECT COALESCE(c.fantasy_name, c.name) FROM public.companies c WHERE c.id = v_s), 'none'),
                  COALESCE((SELECT COALESCE(c.fantasy_name, c.name) FROM public.companies c WHERE c.id = v_s2), 'none')));
    EXIT main WHEN NOT v_pass;

    -- ── 1. Three throwaway logins (as postgres) ────────────────────────────
    -- handle_new_user() adds their user_profiles rows; they are then made
    -- internal + active like every live QC and sys staff login. Only the two
    -- QC logins get a profiles row.
    BEGIN
      EXECUTE v_ins || 'auth.users (id, aud, role, email, created_at, updated_at) VALUES '
                    || '($1, ''authenticated'', ''authenticated'', $2, now(), now()), '
                    || '($3, ''authenticated'', ''authenticated'', $4, now(), now()), '
                    || '($5, ''authenticated'', ''authenticated'', $6, now(), now())'
        USING v_uid, 'zz-check-lab-' || v_tag || '@example.invalid',
              v_hq_uid, 'zz-check-hq-' || v_tag || '@example.invalid',
              v_sys_uid, 'zz-check-sys-' || v_tag || '@example.invalid';

      UPDATE public.user_profiles SET user_type = 'internal', status = 'active'
       WHERE id IN (v_uid, v_hq_uid, v_sys_uid);
      GET DIAGNOSTICS v_n = ROW_COUNT;

      INSERT INTO public.profiles (id, email, full_name, qc_role, laboratory_id, qc_enabled)
      VALUES (v_uid, 'zz-check-lab-' || v_tag || '@example.invalid', 'ZZ Check Lab User',
              'lab_personnel', v_lab, true),
             (v_hq_uid, 'zz-check-hq-' || v_tag || '@example.invalid', 'ZZ Check HQ User',
              'lab_personnel', v_hq, true);

      v_pass := v_n = 3;
      v_detail := format('user_profiles rows made internal/active: %s of 3', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: three throwaway logins', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    -- ── 2. As the confined user ─────────────────────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab
                AND (SELECT public.waqc_is_staff())
                AND NOT (SELECT public.current_user_is_external());
      v_detail := format('scope lab matches: %s, QC staff: %s, role: %s',
                         (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         (SELECT public.waqc_is_staff()), current_user);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined user is confined and QC staff', 'pass', v_pass, 'detail', v_detail);

    -- confined sees 0 of S (company and its contact)
    BEGIN
      v_n  := (SELECT count(*) FROM public.companies WHERE id = v_s);
      v_n2 := (SELECT count(*) FROM public.contacts WHERE id = v_s_contact);
      v_pass := v_n = 0 AND v_n2 = 0;
      v_detail := format('S rows %s, S contact rows %s (both must be 0)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined sees 0 of S', 'pass', v_pass, 'detail', v_detail);

    -- confined cannot write on an unlinked company
    BEGIN
      INSERT INTO public.contacts (company_id, name, first_name, last_name)
      VALUES (v_s, 'ZZ Check Blocked', 'ZZ Check', 'Blocked');
      RAISE EXCEPTION 'zz-check: contact accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a contact was accepted on a company not linked to the lab';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot write on unlinked company', 'pass', v_pass, 'detail', v_detail);

    -- confined insert ... returning works, and links the company to the lab
    BEGIN
      v_new := NULL;
      FOR r IN
        INSERT INTO public.companies (name, country)
        VALUES ('ZZ check co ' || v_tag, 'ZZ check country')
        RETURNING id
      LOOP
        v_new := r.id;
      END LOOP;
      v_n  := (SELECT count(*) FROM public.companies WHERE id = v_new);
      v_n2 := (SELECT count(*) FROM public.company_labs
                WHERE company_id = v_new AND laboratory_id = v_lab AND created_company);
      v_pass := v_new IS NOT NULL AND v_n = 1 AND v_n2 = 1;
      v_detail := format('returned an id: %s, visible rows %s, created_company link rows %s',
                         v_new IS NOT NULL, v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_new := NULL;
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined insert returning works', 'pass', v_pass, 'detail', v_detail);

    -- contact on the new company is stamped with the lab and readable back
    BEGIN
      v_new_contact := NULL;
      FOR r IN
        INSERT INTO public.contacts (company_id, name, first_name, last_name)
        VALUES (v_new, 'ZZ Check Contact', 'ZZ Check', 'Contact')
        RETURNING id
      LOOP
        v_new_contact := r.id;
      END LOOP;
      v_n := (SELECT count(*) FROM public.contacts WHERE id = v_new_contact AND owner_lab_id = v_lab);
      v_pass := v_n = 1;
      v_detail := format('rows with owner_lab_id = the lab: %s', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_new_contact := NULL;
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'contact stamped', 'pass', v_pass, 'detail', v_detail);

    -- PIX-only bank account on the new company
    BEGIN
      v_bank := NULL; v_bank_owner := NULL;
      FOR r IN
        INSERT INTO public.company_bank_accounts (company_id, pix_key, pix_key_type)
        VALUES (v_new, 'zz-check-' || v_tag, 'random')
        RETURNING id, owner_lab_id
      LOOP
        v_bank := r.id; v_bank_owner := r.owner_lab_id;
      END LOOP;
      v_pass := v_bank IS NOT NULL AND v_bank_owner IS NOT DISTINCT FROM v_lab;
      v_detail := format('saved: %s, owner_lab_id = the lab: %s',
                         v_bank IS NOT NULL, v_bank_owner IS NOT DISTINCT FROM v_lab);
    EXCEPTION WHEN OTHERS THEN
      v_bank := NULL;
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'bank account write', 'pass', v_pass, 'detail', v_detail);

    -- bank accounts are never deleted through the API
    BEGIN
      DELETE FROM public.company_bank_accounts WHERE id = v_bank;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE EXCEPTION 'zz-check: delete ran, % row(s)', v_n USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'no delete', 'pass', v_pass, 'detail', v_detail);

    -- the confined user's own sample naming S2 links nothing
    BEGIN
      INSERT INTO public.samples (tracking_number, origin, laboratory_id, seller_id)
      VALUES ('ZZ-CHECK-B-' || v_tag, 'ZZ check origin', v_lab, v_s2);
      v_n  := (SELECT count(*) FROM public.companies WHERE id = v_s2);
      v_n2 := (SELECT count(*) FROM public.company_labs WHERE company_id = v_s2);
      v_pass := v_n = 0 AND v_n2 = 0;
      v_detail := format('sample saved; S2 rows %s, S2 link rows %s (both must be 0)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'sample save failed: ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined sample does not link', 'pass', v_pass, 'detail', v_detail);

    -- ── 3. A non-confined writer (postgres, no JWT) saves a sample naming S ─
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);

    BEGIN
      INSERT INTO public.samples (tracking_number, origin, laboratory_id, exporter_id)
      VALUES ('ZZ-CHECK-A-' || v_tag, 'ZZ check origin', v_lab, v_s);
      v_n := (SELECT count(*) FROM public.company_labs
               WHERE company_id = v_s AND laboratory_id = v_lab AND NOT created_company);
      v_pass := v_n = 1;
      v_detail := format('read-only link rows for S on the lab: %s', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'sample save failed: ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'unconfined sample save links its party', 'pass', v_pass, 'detail', v_detail);

    -- ── 4. The confined user again ──────────────────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_n  := (SELECT count(*) FROM public.companies WHERE id = v_s);
      v_n2 := (SELECT count(*) FROM public.contacts WHERE id = v_s_contact);
      v_pass := v_n = 1 AND v_n2 = 0;
      v_detail := format('S rows %s (must be 1), S contact rows %s (must be 0)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'sample links party', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.companies SET notes = 'x' WHERE id = v_s;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 0;
      v_detail := format('rows updated: %s (must be 0)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'cannot update linked-only company', 'pass', v_pass, 'detail', v_detail);

    -- a company the lab only reads (S, linked by the sample above) cannot be
    -- deleted: the delete reaches 0 rows (or is refused) and S is still there
    -- for postgres. A delete that does run is undone so later rows still hold.
    BEGIN
      DELETE FROM public.companies WHERE id = v_s;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXECUTE 'RESET ROLE';
      v_n2 := (SELECT count(*) FROM public.companies WHERE id = v_s);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_pass := v_n = 0 AND v_n2 = 1;
      v_detail := format('rows deleted: %s (must be 0), S rows for postgres: %s (must be 1)', v_n, v_n2);
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
    v_res := v_res || jsonb_build_object('check', 'cannot delete linked-only company', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.companies SET notes = 'x' WHERE id = v_new;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'can update own company', 'pass', v_pass, 'detail', v_detail);

    -- ── 5. The HQ user reads everything ─────────────────────────────────────
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hq_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NULL
                AND (SELECT public.waqc_is_staff())
                AND NOT (SELECT public.current_user_is_external());
      v_detail := format('scope lab is null: %s, QC staff: %s',
                         (SELECT public.qc_read_scope_lab()) IS NULL, (SELECT public.waqc_is_staff()));
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: HQ user is not confined', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.contacts WHERE id = v_s_contact);
      v_pass := v_n = 1;
      v_detail := format('rows %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user sees contact on S', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.companies WHERE id IN (v_s, v_s2));
      v_pass := v_n = 2;
      v_detail := format('rows %s (must be 2)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user sees S and S2', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.contacts WHERE id = v_new_contact);
      v_pass := v_n = 1;
      v_detail := format('rows %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user sees lab-owned contact', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.company_bank_accounts WHERE id = v_bank);
      v_pass := v_n = 1;
      v_detail := format('rows %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user sees lab-owned bank account', 'pass', v_pass, 'detail', v_detail);

    -- ── 6. A sys-only login (no QC profile) reads everything ───────────────
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_sys_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NULL
                AND NOT (SELECT public.current_user_is_external())
                AND auth.uid() IS NOT DISTINCT FROM v_sys_uid;
      v_detail := format('scope lab is null: %s, external: %s',
                         (SELECT public.qc_read_scope_lab()) IS NULL, (SELECT public.current_user_is_external()));
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: sys-only login is not confined', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.companies WHERE id IN (v_s, v_s2));
      v_pass := v_n = 2;
      v_detail := format('rows %s (must be 2)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'sys user sees S and S2', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.contacts WHERE id = v_s_contact);
      v_pass := v_n = 1;
      v_detail := format('rows %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'sys user sees contact on S', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.contacts WHERE id = v_new_contact);
      v_pass := v_n = 1;
      v_detail := format('rows %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'sys user sees lab-owned contact', 'pass', v_pass, 'detail', v_detail);

    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('check', 'script error: the checks after this did not run',
                                         'pass', false, 'detail', SQLSTATE || ' ' || SQLERRM);
  END main;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- Row 0: the summary. 27 checks when everything ran.
  v_res := jsonb_build_array(jsonb_build_object(
             'check', 'ALL CHECKS PASS',
             'pass', jsonb_array_length(v_res) = 27
                     AND COALESCE((SELECT bool_and(COALESCE((e->>'pass')::boolean, false)) FROM jsonb_array_elements(v_res) e), false),
             'detail', format('%s of %s checks pass (27 expected)',
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
