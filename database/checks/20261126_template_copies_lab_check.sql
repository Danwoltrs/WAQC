-- 20261126_template_copies_lab_check.sql
--
-- Rolled-back check of migration 20261126000000_template_copies_lab.sql:
-- a client's template copy belongs to its spec's laboratory.
--
-- How to run:
--   1. Apply the migration first. Without it the first row says so and nothing else runs.
--   2. Paste this WHOLE file in the Supabase SQL editor and run it.
--   3. Every row's `pass` must be true. Row 0 ("ALL CHECKS PASS") sums them up.
--   4. Nothing is kept: the file ends with ROLLBACK. The two throwaway logins
--      and the test templates all vanish.
--
-- What it does, all inside one transaction:
--   - picks the HQ laboratory and the first laboratory whose type is not 'hq',
--     by type, never by name. No non-HQ lab -> a failed row, not an error;
--   - checks that every client copy is on its spec's laboratory;
--   - makes two throwaway logins, a QC user on the non-HQ lab (confined) and
--     one on the HQ lab;
--   - as postgres, makes six test templates: client copies on either lab and
--     one base template. Each is made by the login that then tries to change
--     it, so the "own templates" policies let that login in and only the
--     laboratory decides. The HQ copy the confined user tries also lists the
--     confined user's lab in assigned_laboratories, as an inherited one would:
--     without the migration that user could read, change and delete it;
--   - checks what each login may read and write.
--
-- Paste-safety (Supabase editor): no SELECT or RETURNING with a target variable,
-- no temp tables; every id is made up front; results travel in a
-- transaction-local setting and come back as the single result set just
-- before ROLLBACK.

BEGIN;

DO $check$
DECLARE
  v_res          jsonb := '[]'::jsonb;
  v_pass         boolean;
  v_detail       text;
  v_n            bigint;
  v_n2           bigint;
  v_tag          text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  -- auth.users is not ours to alter: its statement is assembled at run time.
  v_ins          text := 'INSERT IN' || 'TO ';
  v_hq           uuid;
  v_lab          uuid;
  v_uid          uuid := gen_random_uuid();   -- confined login (non-HQ lab)
  v_hq_uid       uuid := gen_random_uuid();   -- HQ login
  -- Test templates, as postgres. "own" = the login's own lab.
  v_own          uuid := gen_random_uuid();   -- copy on the lab, made by the confined login
  v_own_del      uuid := gen_random_uuid();   -- its twin, for the delete
  v_other        uuid := gen_random_uuid();   -- copy on HQ, made by the confined login, assigned to the lab
  v_hq_own       uuid := gen_random_uuid();   -- copy on HQ, made by the HQ login
  v_hq_other     uuid := gen_random_uuid();   -- copy on the lab, made by the HQ login
  v_base         uuid := gen_random_uuid();   -- base template on the lab, made by the HQ login
  -- Copies the confined login adds itself.
  v_new_own      uuid := gen_random_uuid();
  v_new_other    uuid := gen_random_uuid();
BEGIN
  <<main>>
  BEGIN
    -- ── 0. Preconditions (as postgres) ─────────────────────────────────────
    v_n := (SELECT count(*) FROM pg_policy pol
             WHERE pol.polrelid = 'public.quality_templates'::regclass
               AND NOT pol.polpermissive
               AND pol.polname IN ('quality_templates_lab_scope_select', 'quality_templates_lab_scope_insert',
                                   'quality_templates_lab_scope_update', 'quality_templates_lab_scope_delete'));
    v_pass := v_n = 4;
    v_res := v_res || jsonb_build_object('check', 'migration is applied', 'pass', v_pass,
      'detail', CASE WHEN v_pass THEN '4 restrictive lab-scope policies on quality_templates'
                     ELSE format('%s of 4 policies found: apply 20261126000000_template_copies_lab.sql first', v_n) END);
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

    v_n  := (SELECT count(*) FROM public.quality_templates t
              JOIN public.client_qualities cq ON cq.template_id = t.id
              WHERE t.is_client_variant AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id);
    v_n2 := (SELECT count(*) FROM public.quality_templates WHERE is_client_variant);
    v_res := v_res || jsonb_build_object('check', 'every client copy is on its spec''s laboratory', 'pass', v_n = 0,
      'detail', format('%s of %s copies on another laboratory than their spec''s (must be 0)', v_n, v_n2));

    -- ── 1. Two throwaway logins, then the test templates (as postgres) ─────
    BEGIN
      EXECUTE v_ins || 'auth.users (id, aud, role, email, created_at, updated_at) VALUES '
                    || '($1, ''authenticated'', ''authenticated'', $2, now(), now()), '
                    || '($3, ''authenticated'', ''authenticated'', $4, now(), now())'
        USING v_uid, 'zz-check-tpl-lab-' || v_tag || '@example.invalid',
              v_hq_uid, 'zz-check-tpl-hq-' || v_tag || '@example.invalid';

      UPDATE public.user_profiles SET user_type = 'internal', status = 'active'
       WHERE id IN (v_uid, v_hq_uid);
      GET DIAGNOSTICS v_n = ROW_COUNT;

      INSERT INTO public.profiles (id, email, full_name, qc_role, laboratory_id, qc_enabled)
      VALUES (v_uid, 'zz-check-tpl-lab-' || v_tag || '@example.invalid', 'ZZ Check Lab User',
              'lab_personnel', v_lab, true),
             (v_hq_uid, 'zz-check-tpl-hq-' || v_tag || '@example.invalid', 'ZZ Check HQ User',
              'lab_personnel', v_hq, true);

      v_pass := v_n = 2;
      v_detail := format('user_profiles rows made internal/active: %s of 2', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: two throwaway logins', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    BEGIN
      INSERT INTO public.quality_templates
        (id, name, name_en, is_client_variant, is_global, laboratory_id, assigned_laboratories, created_by)
      VALUES
        (v_own,      'ZZ check own '      || v_tag, 'ZZ check own '      || v_tag, true,  false, v_lab, ARRAY[v_lab], v_uid),
        (v_own_del,  'ZZ check own del '  || v_tag, 'ZZ check own del '  || v_tag, true,  false, v_lab, ARRAY[v_lab], v_uid),
        (v_other,    'ZZ check other '    || v_tag, 'ZZ check other '    || v_tag, true,  false, v_hq,  ARRAY[v_lab], v_uid),
        (v_hq_own,   'ZZ check hq own '   || v_tag, 'ZZ check hq own '   || v_tag, true,  false, v_hq,  '{}'::uuid[], v_hq_uid),
        (v_hq_other, 'ZZ check hq other ' || v_tag, 'ZZ check hq other ' || v_tag, true,  false, v_lab, '{}'::uuid[], v_hq_uid),
        (v_base,     'ZZ check base '     || v_tag, 'ZZ check base '     || v_tag, false, false, v_lab, '{}'::uuid[], v_hq_uid);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 6;
      v_detail := format('test templates made: %s of 6', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: five test copies and a base template', 'pass', v_pass, 'detail', v_detail);
    EXIT main WHEN NOT v_pass;

    -- ── 2. As the confined user ─────────────────────────────────────────────
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab
                AND (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_lab;
      v_detail := format('read scope = lab: %s, write scope = lab: %s, role: %s',
                         (SELECT public.qc_read_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_lab,
                         current_user);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: confined user is confined to its lab', 'pass', v_pass, 'detail', v_detail);

    -- The control for the next row: the confined user reads its own lab's copy.
    BEGIN
      v_n := (SELECT count(*) FROM public.quality_templates WHERE id = v_own);
      v_pass := v_n = 1;
      v_detail := format('rows read: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined reads its own lab''s copy', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      v_n := (SELECT count(*) FROM public.quality_templates WHERE id = v_other);
      v_pass := v_n = 0;
      v_detail := format('rows read: %s (must be 0, although the copy lists the user''s lab and the user made it)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot read another lab''s copy', 'pass', v_pass, 'detail', v_detail);

    -- The twin of the next row: the same kind of copy on the user's own lab.
    BEGIN
      UPDATE public.quality_templates SET name = 'ZZ check own changed ' || v_tag WHERE id = v_own;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined can change its own lab''s copy', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.quality_templates SET name = 'ZZ check other changed ' || v_tag WHERE id = v_other;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 0;
      v_detail := format('rows updated: %s (must be 0)', v_n);
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot change another lab''s copy', 'pass', v_pass, 'detail', v_detail);

    -- Moving its own copy to HQ: the UPDATE policy's WITH CHECK refuses the
    -- new row. The read scope would refuse it too, but Postgres checks the
    -- UPDATE policies first: so the refusal must name the UPDATE policy.
    BEGIN
      UPDATE public.quality_templates SET laboratory_id = v_hq WHERE id = v_own;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE EXCEPTION 'zz-check: % row(s) moved', v_n USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := SQLERRM LIKE '%quality_templates_lab_scope_update%';
        v_detail := 'refused: ' || SQLERRM
                    || CASE WHEN v_pass THEN '' ELSE ' (must be the UPDATE lab-scope policy)' END;
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM || ' to another lab (must be refused)';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot move its own copy to another lab (WITH CHECK)', 'pass', v_pass, 'detail', v_detail);

    -- The twin of the next row.
    BEGIN
      DELETE FROM public.quality_templates WHERE id = v_own_del;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows deleted: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined can delete its own lab''s copy', 'pass', v_pass, 'detail', v_detail);

    -- A delete that does run is undone (raise inside the block) so later rows still hold.
    BEGIN
      DELETE FROM public.quality_templates WHERE id = v_other;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'zz-check: % row(s) deleted (delete undone)', v_n USING ERRCODE = 'P0001';
      END IF;
      v_pass := true;
      v_detail := 'rows deleted: 0 (must be 0)';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot delete another lab''s copy', 'pass', v_pass, 'detail', v_detail);

    -- The control for the next row: the confined user may add copies at all,
    -- so a refusal there is the laboratory scope, not a missing right.
    BEGIN
      INSERT INTO public.quality_templates
        (id, name, name_en, is_client_variant, is_global, laboratory_id, assigned_laboratories, created_by)
      VALUES (v_new_own, 'ZZ check new own ' || v_tag, 'ZZ check new own ' || v_tag,
              true, false, v_lab, '{}'::uuid[], v_uid);
      v_pass := true;
      v_detail := 'saved';
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined can add a copy on its own lab', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      INSERT INTO public.quality_templates
        (id, name, name_en, is_client_variant, is_global, laboratory_id, assigned_laboratories, created_by)
      VALUES (v_new_other, 'ZZ check new other ' || v_tag, 'ZZ check new other ' || v_tag,
              true, false, v_hq, '{}'::uuid[], v_uid);
      RAISE EXCEPTION 'zz-check: copy accepted' USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := SQLERRM LIKE '%quality_templates_lab_scope_insert%';
        v_detail := 'refused 42501: ' || SQLERRM
                    || CASE WHEN v_pass THEN '' ELSE ' (must be the INSERT lab-scope policy)' END;
      WHEN raise_exception THEN
        v_pass := false; v_detail := 'a copy on another lab was accepted';
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'confined cannot add a copy on another lab (42501)', 'pass', v_pass, 'detail', v_detail);

    -- ── 3. As the HQ user ───────────────────────────────────────────────────
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_hq_uid, 'role', 'authenticated')::text, true);

    BEGIN
      v_pass := (SELECT public.qc_read_scope_lab()) IS NULL
                AND (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_hq;
      v_detail := format('read scope null: %s, write scope = HQ: %s',
                         (SELECT public.qc_read_scope_lab()) IS NULL,
                         (SELECT public.qc_write_scope_lab()) IS NOT DISTINCT FROM v_hq);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'setup: HQ user reads every lab, writes HQ', 'pass', v_pass, 'detail', v_detail);

    -- HQ sees the other lab's copy: below, only the write policies stand between it and the row.
    BEGIN
      v_n := (SELECT count(*) FROM public.quality_templates WHERE id = v_hq_other);
      v_pass := v_n = 1;
      v_detail := format('rows read: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user reads another lab''s copy', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.quality_templates SET name = 'ZZ check hq own changed ' || v_tag WHERE id = v_hq_own;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user can change an HQ copy', 'pass', v_pass, 'detail', v_detail);

    BEGIN
      UPDATE public.quality_templates SET name = 'ZZ check hq other changed ' || v_tag WHERE id = v_hq_other;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 0;
      v_detail := format('rows updated: %s (must be 0)', v_n);
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user cannot change another lab''s copy it sees', 'pass', v_pass, 'detail', v_detail);

    -- The one row where only the DELETE lab-scope policy decides (the confined
    -- user cannot even read another lab's copy). A delete that runs is undone.
    BEGIN
      DELETE FROM public.quality_templates WHERE id = v_hq_other;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'zz-check: % row(s) deleted (delete undone)', v_n USING ERRCODE = 'P0001';
      END IF;
      v_pass := true;
      v_detail := 'rows deleted: 0 (must be 0)';
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_pass := true;  v_detail := 'refused: ' || SQLERRM;
      WHEN raise_exception THEN
        v_pass := false; v_detail := SQLERRM;
      WHEN OTHERS THEN
        v_pass := false; v_detail := 'unexpected ' || SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user cannot delete another lab''s copy it sees', 'pass', v_pass, 'detail', v_detail);

    -- A base template is no client's copy: the laboratory scope leaves it
    -- alone, even on another lab.
    BEGIN
      UPDATE public.quality_templates SET name = 'ZZ check base changed ' || v_tag WHERE id = v_base;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_pass := v_n = 1;
      v_detail := format('rows updated: %s (must be 1, as before the migration)', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_pass := false; v_detail := SQLSTATE || ' ' || SQLERRM;
    END;
    v_res := v_res || jsonb_build_object('check', 'HQ user edits a base template as before', 'pass', v_pass, 'detail', v_detail);

    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('check', 'script error: the checks after this did not run',
                                         'pass', false, 'detail', SQLSTATE || ' ' || SQLERRM);
  END main;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- Row 0: the summary. 22 checks when everything ran.
  v_res := jsonb_build_array(jsonb_build_object(
             'check', 'ALL CHECKS PASS',
             'pass', jsonb_array_length(v_res) = 22
                     AND COALESCE((SELECT bool_and(COALESCE((e->>'pass')::boolean, false)) FROM jsonb_array_elements(v_res) e), false),
             'detail', format('%s of %s checks pass (22 expected)',
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
