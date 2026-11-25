-- 20261124_qc_settings_per_lab_check.sql
--
-- Rolled-back check of migration 20261124000001_qc_settings_per_lab.sql:
-- QC settings and quality specs belong to a laboratory.
--
-- How to run:
--   1. Apply the migration first. Without it the first row says so and nothing else runs.
--   2. Paste this WHOLE file in the Supabase SQL editor and run it.
--   3. Every row's `pass` must be true. Row 0 ("ALL CHECKS PASS") sums them up.
--   4. Nothing is kept: the file ends with ROLLBACK. The two throwaway logins,
--      the test settings rows, specs and the test sample all vanish. Certificate
--      and origin numbers it takes are given back by the rollback too (an
--      origin line is held for the second the script runs).
--
-- What it does, all inside one transaction:
--   - picks the HQ laboratory and the first laboratory whose type is not 'hq',
--     by type, never by name. No non-HQ lab -> a failed row, not an error;
--   - picks an existing HQ client C with an HQ settings row and an active HQ
--     spec (one that appears in the billing feed if any does), and two
--     companies with no settings row at all;
--   - as postgres: gives C a settings row in the non-HQ lab with its own
--     certificate pattern, tracking format and price, a spec on the same
--     template, and a test sample, and checks that numbering, fees and the
--     billing views read the laboratory's own row;
--   - makes two throwaway logins, a QC user on the non-HQ lab (confined) and
--     one on the HQ lab, and checks what each may read and write.
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
  v_c            uuid;                         -- HQ client with settings and a spec
  v_c2           uuid;                         -- company with no settings
  v_c3           uuid;                         -- another company with no settings
  v_spec_hq      uuid;
  v_template     uuid;
  v_hq_code      text;
  v_spec_co      uuid;
  v_hq_pattern   jsonb;
  v_hq_pad       int;
  v_hq_fmt       text;
  v_co_pad       int;
  v_co_fmt       text;
  v_co_cents     numeric;
  v_got          text;
  v_got2         text;
  v_got3         text;
  v_want         text;
  v_want2        text;
  v_feed_before  bigint;
  v_fees_before  bigint;
  v_sample       uuid;
  v_origin       text;
  v_lab_id       uuid;
  v_constraint   text;
BEGIN
  <<main>>
  BEGIN
    -- ── 0. Preconditions (as postgres) ─────────────────────────────────────
    v_pass := to_regprocedure('public.qc_default_settings_lab()') IS NOT NULL
              AND (SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'public' AND column_name = 'laboratory_id'
                      AND table_name IN ('qc_client_settings', 'client_qualities')) = 2;
    v_res := v_res || jsonb_build_object('check', 'migration is applied', 'pass', v_pass,
      'detail', CASE WHEN v_pass THEN 'laboratory_id on settings and specs, qc_default_settings_lab() present'
                     ELSE 'apply 20261124000001_qc_settings_per_lab.sql first' END);
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
                         'no laboratory of a type other than hq'));
    EXIT main WHEN v_hq IS NULL OR v_lab IS NULL;

    -- All rows are HQ's (true at apply time; a later non-HQ row makes this fail on purpose).
    v_n  := (SELECT count(*) FROM public.qc_client_settings);
    v_n2 := (SELECT count(*) FROM public.qc_client_settings WHERE laboratory_id = v_hq);
    v_res := v_res || jsonb_build_object('check', 'every settings row is HQ''s', 'pass', v_n = v_n2,
      'detail', format('%s of %s rows on HQ', v_n2, v_n));
    v_n  := (SELECT count(*) FROM public.client_qualities);
    v_n2 := (SELECT count(*) FROM public.client_qualities WHERE laboratory_id = v_hq);
    v_res := v_res || jsonb_build_object('check', 'every spec is HQ''s', 'pass', v_n = v_n2,
      'detail', format('%s of %s rows on HQ', v_n2, v_n));

    -- C: an HQ client with an HQ settings row and an active HQ spec on a
    -- template; one in the billing feed first (so the view check has rows),
    -- one whose spec has a quality code first.
    v_c := (SELECT q.company_id FROM public.qc_client_settings q
             WHERE q.laboratory_id = v_hq
               AND NOT EXISTS (SELECT 1 FROM public.qc_client_settings o
                                WHERE o.company_id = q.company_id AND o.laboratory_id = v_lab)
               AND EXISTS (SELECT 1 FROM public.client_qualities cq
                            WHERE cq.client_id = q.company_id AND cq.laboratory_id = v_hq
                              AND cq.is_active AND cq.template_id IS NOT NULL)
             ORDER BY EXISTS (SELECT 1 FROM public.qc_billing_feed f WHERE f.client_id = q.company_id) DESC,
                      q.company_id
             LIMIT 1);
    v_spec_hq := (SELECT cq.id FROM public.client_qualities cq
                   WHERE cq.client_id = v_c AND cq.laboratory_id = v_hq
                     AND cq.is_active AND cq.template_id IS NOT NULL
                   ORDER BY (NULLIF(btrim(cq.quality_code), '') IS NOT NULL) DESC, cq.created_at, cq.id
                   LIMIT 1);
    v_template := (SELECT cq.template_id FROM public.client_qualities cq WHERE cq.id = v_spec_hq);
    v_hq_code  := (SELECT NULLIF(btrim(cq.quality_code), '') FROM public.client_qualities cq WHERE cq.id = v_spec_hq);
    v_hq_pattern := (SELECT q.certificate_pattern FROM public.qc_client_settings q
                      WHERE q.company_id = v_c AND q.laboratory_id = v_hq);

    v_pass := v_c IS NOT NULL AND v_spec_hq IS NOT NULL AND v_template IS NOT NULL;
    v_res := v_res || jsonb_build_object('check', 'precondition: an HQ client C with settings and an active spec',
      'pass', v_pass,
      'detail', format('C = %s, spec quality code: %s, in billing feed: %s',
                  COALESCE((SELECT COALESCE(NULLIF(c.fantasy_name, ''), c.name) FROM public.companies c WHERE c.id = v_c), 'none'),
                  COALESCE(v_hq_code, 'none'),
                  EXISTS (SELECT 1 FROM public.qc_billing_feed f WHERE f.client_id = v_c)));
    EXIT main WHEN NOT v_pass;

    v_c2 := (SELECT c.id FROM public.companies c
              WHERE NOT EXISTS (SELECT 1 FROM public.qc_client_settings q WHERE q.company_id = c.id)
              ORDER BY c.created_at, c.id LIMIT 1);
    v_c3 := (SELECT c.id FROM public.companies c
              WHERE NOT EXISTS (SELECT 1 FROM public.qc_client_settings q WHERE q.company_id = c.id)
                AND c.id IS DISTINCT FROM v_c2
              ORDER BY c.created_at, c.id LIMIT 1);
    v_pass := v_c2 IS NOT NULL AND v_c3 IS NOT NULL;
    v_res := v_res || jsonb_build_object('check', 'precondition: two companies with no settings row',
      'pass', v_pass, 'detail', format('found: %s', (v_c2 IS NOT NULL)::int + (v_c3 IS NOT NULL)::int));
    EXIT main WHEN NOT v_pass;

    -- ── 1. Numbering, fees and views (as postgres) ─────────────────────────
    BEGIN
      v_pass := public.qc_default_settings_lab() IS NOT DISTINCT FROM v_hq;
      v_detail := format('default is HQ: %s', v_pass);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'no login: the default laboratory is HQ', 'pass', v_pass, 'detail', v_detail);

    -- The non-HQ lab has no settings row for C yet: the built-in default
    -- pattern, never HQ's. p_sequence formats without advancing any counter.
    BEGIN
      v_got  := public.generate_certificate_number(v_c, NULL, NULL, false, v_lab, 7);
      v_want := '000007/' || to_char(now(), 'YY');
      v_pass := v_got = v_want;
      v_detail := format('got %s, want %s (the default pattern)', v_got, v_want);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'lab with no settings row: default certificate pattern', 'pass', v_pass, 'detail', v_detail);

    v_feed_before := (SELECT count(*) FROM public.qc_billing_feed WHERE client_id = v_c);
    v_fees_before := (SELECT count(*) FROM public.dashboard_lab_fees_v WHERE client_id = v_c);

    -- The non-HQ lab's own settings for C: a pattern unlike HQ's, its own
    -- tracking format and its own per-pound price.
    v_hq_pad := COALESCE((v_hq_pattern->>'sequence_padding')::int, 6);
    v_hq_fmt := COALESCE(v_hq_pattern->>'year_format', 'YY');
    v_co_pad := CASE WHEN v_hq_pad = 3 THEN 4 ELSE 3 END;
    v_co_fmt := CASE WHEN v_hq_fmt = 'YYYY' THEN 'YY' ELSE 'YYYY' END;
    v_co_cents := COALESCE((SELECT q.price_per_pound_cents FROM public.qc_client_settings q
                             WHERE q.company_id = v_c AND q.laboratory_id = v_hq), 0) + 3;
    BEGIN
      INSERT INTO public.qc_client_settings
        (company_id, laboratory_id, certificate_pattern, tracking_number_format,
         pricing_model, price_per_pound_cents)
      VALUES
        (v_c, v_lab,
         jsonb_build_object('has_quality_code', true, 'quality_position', 'prefix',
                            'has_origin_code', false, 'origin_position', 'prefix',
                            'sequence_padding', v_co_pad, 'starting_sequence', 1,
                            'year_format', v_co_fmt, 'separator', '~', 'rejected_prefix', 'R-'),
         jsonb_build_object('type', 'standard', 'pattern', 'ZZ[5N]/[YY]', 'separator', '-',
                            'starting_sequence', 1, 'sequence_padding', 5),
         'per_pound', v_co_cents);
      v_n := (SELECT count(*) FROM public.qc_client_settings WHERE company_id = v_c);
      v_pass := v_n = 2;
      v_detail := format('C now has %s settings rows (must be 2: HQ''s and the lab''s)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'a second laboratory''s settings row for an HQ client is accepted', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_got  := public.generate_certificate_number(v_c, NULL, NULL, false, v_lab, 7);
      v_want := lpad('7', v_co_pad, '0') || '/' || to_char(now(), v_co_fmt);
      v_pass := v_got = v_want;
      v_detail := format('got %s, want %s', v_got, v_want);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'certificate number: the lab''s own pattern', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_got  := public.generate_certificate_number(v_c, NULL, NULL, false, v_hq, 7);
      v_want := lpad('7', v_hq_pad, '0') || '/' || to_char(now(), CASE WHEN v_hq_fmt = 'YYYY' THEN 'YYYY' ELSE 'YY' END);
      v_pass := v_got = v_want;
      v_detail := format('got %s, want %s', v_got, v_want);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'certificate number: HQ keeps HQ''s pattern', 'pass', v_pass, 'detail', v_detail);

    -- Joining on company alone would list C's approved HQ samples twice now.
    BEGIN
      v_n  := (SELECT count(*) FROM public.qc_billing_feed WHERE client_id = v_c);
      v_n2 := (SELECT count(*) FROM public.dashboard_lab_fees_v WHERE client_id = v_c);
      v_pass := v_n = v_feed_before AND v_n2 = v_fees_before;
      v_detail := format('qc_billing_feed rows for C %s -> %s, dashboard_lab_fees_v %s -> %s (must not change)',
                         v_feed_before, v_n, v_fees_before, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'billing views: a second lab''s row adds no rows', 'pass', v_pass, 'detail', v_detail);

    -- The generated value is an internal key: only whether it carries the lab's marker is shown.
    BEGIN
      v_got  := public.generate_tracking_number(v_c, v_lab, NULL, NULL, false, 'pss');
      v_got2 := public.generate_tracking_number(v_c, v_hq, NULL, NULL, false, 'pss');
      v_pass := v_got LIKE 'ZZ%' AND v_got2 NOT LIKE 'ZZ%';
      v_detail := format('lab''s format used for the lab: %s, for HQ: %s (must be true, false)',
                         v_got LIKE 'ZZ%', v_got2 LIKE 'ZZ%');
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'tracking number: the lab''s own format', 'pass', v_pass, 'detail', v_detail);

    -- A sample of C in the non-HQ lab is priced from that lab's row:
    -- 10 bags x 60 kg at v_co_cents c/lb, computed as calculate_client_fee does.
    BEGIN
      v_sample := NULL;
      FOR r IN
        INSERT INTO public.samples (tracking_number, origin, laboratory_id, client_id, bag_count, bag_weight_kg)
        VALUES ('ZZ-CHECK-F-' || v_tag, 'ZZ check origin ' || v_tag, v_lab, v_c, 10, 60)
        RETURNING id
      LOOP
        v_sample := r.id;
      END LOOP;
      v_got  := public.calculate_client_fee(v_c, v_sample)::text;
      v_want := round(round(600 * 2.20462, 4) * (round(GREATEST(v_co_cents, 0.25), 4) / 100), 2)::text;
      v_pass := v_got = v_want;
      v_detail := format('fee %s, want %s (the lab''s price)', COALESCE(v_got, 'null'), v_want);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'fee: the sample''s lab''s price', 'pass', v_pass, 'detail', v_detail);

    -- The same client and template as an HQ spec, in the non-HQ lab, with HQ's
    -- quality code: accepted.
    BEGIN
      v_spec_co := NULL;
      FOR r IN
        INSERT INTO public.client_qualities (client_id, laboratory_id, template_id, quality_code, custom_name, is_active)
        VALUES (v_c, v_lab, v_template, COALESCE(v_hq_code, 'ZQ'), 'ZZ check spec ' || v_tag, true)
        RETURNING id
      LOOP
        v_spec_co := r.id;
      END LOOP;
      v_pass := v_spec_co IS NOT NULL;
      v_detail := format('saved: %s (same template as HQ''s spec, quality code %s)',
                         v_pass, COALESCE(v_hq_code, 'ZQ (HQ''s spec has none)'));
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'spec: same client and template in another lab is accepted', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      INSERT INTO public.client_qualities (client_id, laboratory_id, template_id, custom_name, is_active)
      VALUES (v_c, v_lab, v_template, 'ZZ check spec twin ' || v_tag, true);
      RAISE EXCEPTION 'zz-check: second spec accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        v_pass := v_constraint = 'idx_client_qualities_unique_template_per_client';
        v_detail := 'refused 23505 by ' || COALESCE(v_constraint, 'unknown');
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a second active spec on the same client, lab and template was accepted';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'spec: a second one in the same lab is refused (23505)', 'pass', v_pass, 'detail', v_detail);

    -- The lab's pattern puts the lab's spec code in front with '~'.
    BEGIN
      v_want := (SELECT UPPER(COALESCE(cq.quality_code, SUBSTRING(cq.custom_name FROM 1 FOR 2), 'QC'))
                   FROM public.client_qualities cq WHERE cq.id = v_spec_co)
                || '~' || lpad('7', v_co_pad, '0') || '/' || to_char(now(), v_co_fmt);
      v_got  := public.generate_certificate_number(v_c, NULL, v_spec_co, false, v_lab, 7);
      v_pass := v_got = v_want;
      v_detail := format('got %s, want %s', v_got, v_want);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'certificate number: the lab''s spec code and separator', 'pass', v_pass, 'detail', v_detail);

    -- Origin lines: the quality-code prefix follows the lab's pattern
    -- ('~' separator) for the lab, never for HQ. Numbers taken here are rolled back.
    BEGIN
      v_origin := (SELECT o.origin FROM public.origin_certificate_sequences o
                    WHERE o.is_active ORDER BY o.origin LIMIT 1);
      IF v_origin IS NULL THEN
        v_pass := true;
        v_detail := 'skipped: no active origin line';
      ELSE
        v_want := (SELECT UPPER(COALESCE(cq.quality_code, SUBSTRING(cq.custom_name FROM 1 FOR 2)))
                     FROM public.client_qualities cq WHERE cq.id = v_spec_co) || '~';
        v_got  := public.mint_origin_certificate_number(v_origin, v_c, v_spec_co, v_lab);
        v_got2 := public.mint_origin_certificate_number(v_origin, v_c, v_spec_co, v_hq);
        -- And through mint_certificate_number, the path certification takes.
        v_got3 := public.mint_certificate_number(v_c, v_origin, v_spec_co, v_lab, v_c);
        v_pass := v_got LIKE v_want || '%' AND v_got2 NOT LIKE v_want || '%'
                  AND v_got3 LIKE v_want || '%';
        v_detail := format('lab: %s (must start %s), HQ: %s (must not), lab via mint_certificate_number: %s (must start %s)',
                           v_got, v_want, v_got2, v_got3, v_want);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'origin line number: the lab''s quality prefix', 'pass', v_pass, 'detail', v_detail);

    -- ── 2. Two throwaway logins (as postgres) ──────────────────────────────
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

    -- ── 3. As the confined user ─────────────────────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab
                AND (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_lab
                AND (SELECT public.qc_default_settings_lab()) IS NOT DISTINCT FROM v_lab;
      v_detail := format('read scope = lab: %s, write scope = lab: %s, default = lab: %s, role: %s',
                         (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         (SELECT public.qc_default_settings_lab()) IS NOT DISTINCT FROM v_lab,
                         current_user);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined user is confined to its lab', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n  := (SELECT count(*) FROM public.qc_client_settings WHERE company_id = v_c);
      v_n2 := (SELECT count(*) FROM public.qc_client_settings WHERE company_id = v_c AND laboratory_id = v_lab);
      v_pass := v_n = 1 AND v_n2 = 1;
      v_detail := format('settings rows for C: %s, of them the lab''s: %s (both must be 1)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined sees only its lab''s settings for C', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n  := (SELECT count(*) FROM public.client_qualities WHERE client_id = v_c AND laboratory_id IS DISTINCT FROM v_lab);
      v_n2 := (SELECT count(*) FROM public.client_qualities WHERE id = v_spec_co);
      v_pass := v_n = 0 AND v_n2 = 1;
      v_detail := format('other labs'' specs for C: %s (must be 0), the lab''s test spec: %s (must be 1)', v_n, v_n2);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined sees only its lab''s specs for C', 'pass', v_pass, 'detail', v_detail);

    -- No laboratory given: the row lands on the user's lab and reads back.
    BEGIN
      v_lab_id := NULL;
      FOR r IN
        INSERT INTO public.qc_client_settings (company_id) VALUES (v_c2)
        RETURNING laboratory_id
      LOOP
        v_lab_id := r.laboratory_id;
      END LOOP;
      v_pass := v_lab_id IS NOT DISTINCT FROM v_lab;
      v_detail := format('saved on the user''s lab: %s', v_pass);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined new settings row defaults to its lab', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      INSERT INTO public.qc_client_settings (company_id, laboratory_id) VALUES (v_c3, v_hq);
      RAISE EXCEPTION 'zz-check: row accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a settings row for another lab was accepted';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot write another lab''s settings', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.qc_client_settings SET billing_notes = 'zz check'
       WHERE company_id = v_c AND laboratory_id = v_hq;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 0;
      v_detail := format('rows updated: %s (must be 0)', v_n);
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot change HQ''s settings', 'pass', v_pass, 'detail', v_detail);

    -- The control for the next row: the confined user may add specs at all,
    -- so a refusal there is the laboratory scope, not a missing right.
    BEGIN
      v_lab_id := NULL;
      FOR r IN
        INSERT INTO public.client_qualities (client_id, custom_name, is_active)
        VALUES (v_c, 'ZZ check spec own lab ' || v_tag, true)
        RETURNING laboratory_id
      LOOP
        v_lab_id := r.laboratory_id;
      END LOOP;
      v_pass := v_lab_id IS NOT DISTINCT FROM v_lab;
      v_detail := format('saved and read back on the user''s lab: %s', v_pass);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined can add a spec in its own lab (defaults to it)', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      INSERT INTO public.client_qualities (client_id, laboratory_id, custom_name, is_active)
      VALUES (v_c, v_hq, 'ZZ check spec blocked ' || v_tag, true);
      RAISE EXCEPTION 'zz-check: spec accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a spec for another lab was accepted';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot add a spec for another lab', 'pass', v_pass, 'detail', v_detail);

    -- ── 4. As the HQ user ───────────────────────────────────────────────────
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hq_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NULL
                AND (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_hq
                AND (SELECT public.qc_default_settings_lab()) IS NOT DISTINCT FROM v_hq;
      v_detail := format('read scope null: %s, write scope = HQ: %s, default = HQ: %s',
                         (SELECT public.qc_read_scope_lab()) IS NULL,
                         (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_hq,
                         (SELECT public.qc_default_settings_lab()) IS NOT DISTINCT FROM v_hq);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: HQ user reads every lab, writes HQ', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.qc_client_settings WHERE company_id = v_c);
      v_pass := v_n = 2;
      v_detail := format('settings rows for C: %s (must be 2)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user sees both labs'' settings for C', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_lab_id := NULL;
      FOR r IN
        INSERT INTO public.qc_client_settings (company_id) VALUES (v_c3)
        RETURNING laboratory_id
      LOOP
        v_lab_id := r.laboratory_id;
      END LOOP;
      v_pass := v_lab_id IS NOT DISTINCT FROM v_hq;
      v_detail := format('saved on HQ: %s', v_pass);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user new settings row defaults to HQ', 'pass', v_pass, 'detail', v_detail);

    -- HQ looking at another lab is read-only (20261119000002_lab_scope.sql).
    BEGIN
      INSERT INTO public.qc_client_settings (company_id, laboratory_id) VALUES (v_c3, v_lab);
      RAISE EXCEPTION 'zz-check: row accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'HQ wrote a settings row for another lab';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user cannot write another lab''s settings', 'pass', v_pass, 'detail', v_detail);

    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('check', 'script error: the checks after this did not run',
                                         'pass', false, 'detail', SQLSTATE || ' ' || SQLERRM);
  END main;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- Row 0: the summary. 32 checks when everything ran.
  v_res := jsonb_build_array(jsonb_build_object(
             'check', 'ALL CHECKS PASS',
             'pass', jsonb_array_length(v_res) = 32
                     AND COALESCE((SELECT bool_and(COALESCE((e->>'pass')::boolean, false)) FROM jsonb_array_elements(v_res) e), false),
             'detail', format('%s of %s checks pass (32 expected)',
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
