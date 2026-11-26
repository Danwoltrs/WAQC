-- 20261126000000_template_copies_lab.sql
--
-- A client's template copy belongs to its spec's laboratory.
--
-- Every client quality spec reads its own private copy of a template
-- (quality_templates.is_client_variant = true, migration 20261111000000). The
-- copy holds the spec's parameters, so it is as much the laboratory's as the
-- spec is (client_qualities.laboratory_id, migration 20261124000001). Until now
-- the copy kept its source template's laboratory_id (often none) and its
-- source's assigned_laboratories, and quality_templates' policies ignored the
-- laboratory: a user of one laboratory could change or delete another
-- laboratory's copy (its spec's parameters), and could read one through the
-- inherited assigned_laboratories.
--
--   backfill   every copy takes its spec's laboratory. Live on 2026-11-26: 88
--              copies, one per spec, all 88 specs on the HQ laboratory; 50
--              copies had no laboratory, 38 were HQ's, so 50 rows change.
--              updated_at is left as it was (its trigger is paused for it).
--   policies   four RESTRICTIVE policies, for client copies only (a base
--              template, is_client_variant = false, passes them untouched):
--                read   a confined user (qc_read_scope_lab()) reads its own
--                       laboratory's copies only; HQ, global admins, users with
--                       no laboratory, portal users and the service role read
--                       every copy, as with specs;
--                write  everyone adds, changes and deletes copies in their own
--                       laboratory only (qc_write_scope_lab()), a global admin
--                       anywhere. HQ's write scope is the HQ laboratory: HQ
--                       reads another laboratory's copy but cannot change it,
--                       the same rule as for settings and specs.
--
-- Who else reads or writes copies, checked on 2026-11-26:
--   - the client portal's Qualities pages read specs and their templates with
--     the service role (src/lib/portal/portal-qualities-fetch.ts), where no
--     policy applies; qc_read_scope_lab() is NULL for portal roles anyway;
--   - apply_client_quality_version (a client's scheduled change) runs as the
--     service role (the daily job and the portal);
--   - clone_quality_template makes base templates only.
--
-- Apply this AFTER the Part 3 code with "a client's template copy belongs to
-- its spec's laboratory" is live. That code puts each new copy on its spec's
-- laboratory and stops the template editor from moving a copy's laboratory.
-- The code live before it copies the source template's laboratory, mostly
-- none: with these policies, an HQ user who is not a global admin would then
-- be refused (42501, a 500 on screen) when adding a spec on such a template.
--
-- Locks, both taken up front: client_qualities first (SHARE: specs stay
-- readable, but no spec changes for the second this runs), then
-- quality_templates (ACCESS EXCLUSIVE, which the policies need anyway). A
-- statement that changes a spec takes the spec table before it reads the
-- template back, and one that only reads specs never blocks SHARE, so this
-- order cannot deadlock with them. lock_timeout is 3s: if either is busy the
-- whole transaction rolls back and nothing has changed; simply run it again.
--
-- The policies are RESTRICTIVE: they can only narrow, and a sys policy reset
-- (which drops PERMISSIVE policies only) leaves them in place. No existing
-- policy is dropped or altered, sys's deny policies included.
--
-- Safe to run twice. In the Supabase SQL editor it ends with
-- "Success. No rows returned". Confirm with the post-apply SELECT at the end.

BEGIN;

-- Fail fast rather than queue behind a busy table.
SET LOCAL lock_timeout = '3s';

LOCK TABLE public.client_qualities IN SHARE MODE;
LOCK TABLE public.quality_templates IN ACCESS EXCLUSIVE MODE;

-- ── Preconditions ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- The lab scope of Part 1 and the spec laboratory of Part 2 must be there.
  IF to_regprocedure('public.qc_read_scope_lab()') IS NULL
     OR to_regprocedure('public.qc_write_scope_lab()') IS NULL THEN
    RAISE EXCEPTION 'apply 20261119000002_lab_scope.sql first: qc_read_scope_lab / qc_write_scope_lab are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'client_qualities'
                   AND column_name = 'laboratory_id') THEN
    RAISE EXCEPTION 'apply 20261124000001_qc_settings_per_lab.sql first: client_qualities.laboratory_id is missing';
  END IF;

  -- A copy shared by specs of two laboratories cannot follow both of them.
  v_count := (SELECT count(*) FROM (
                SELECT cq.template_id
                FROM public.client_qualities cq
                JOIN public.quality_templates t ON t.id = cq.template_id
                WHERE t.is_client_variant
                GROUP BY cq.template_id
                HAVING count(DISTINCT cq.laboratory_id) > 1) shared);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% client template copies are used by specs of more than one laboratory: give each spec its own copy first', v_count;
  END IF;

  -- How many copies the backfill moves; reported at the end.
  PERFORM set_config('template_copies_lab.moved',
                     (SELECT count(DISTINCT t.id)
                      FROM public.quality_templates t
                      JOIN public.client_qualities cq ON cq.template_id = t.id
                      WHERE t.is_client_variant
                        AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id)::text, true);
END $$;

-- ── Backfill: every copy takes its spec's laboratory ───────────────────────
-- updated_at stays as it was.
ALTER TABLE public.quality_templates DISABLE TRIGGER update_quality_templates_updated_at;
UPDATE public.quality_templates t
SET laboratory_id = cq.laboratory_id
FROM public.client_qualities cq
WHERE cq.template_id = t.id
  AND t.is_client_variant
  AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id;
ALTER TABLE public.quality_templates ENABLE TRIGGER update_quality_templates_updated_at;

-- ── Policies: client copies only ───────────────────────────────────────────
-- The scope is read once per statement ((SELECT ...) is an init plan), not per row.

DROP POLICY IF EXISTS quality_templates_lab_scope_select ON public.quality_templates;
CREATE POLICY quality_templates_lab_scope_select ON public.quality_templates
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT is_client_variant
         OR (SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS quality_templates_lab_scope_insert ON public.quality_templates;
CREATE POLICY quality_templates_lab_scope_insert ON public.quality_templates
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT is_client_variant
              OR (SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS quality_templates_lab_scope_update ON public.quality_templates;
CREATE POLICY quality_templates_lab_scope_update ON public.quality_templates
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT is_client_variant
         OR (SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()))
  WITH CHECK (NOT is_client_variant
              OR (SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS quality_templates_lab_scope_delete ON public.quality_templates;
CREATE POLICY quality_templates_lab_scope_delete ON public.quality_templates
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT is_client_variant
         OR (SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()));

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
BEGIN
  -- Every copy is on its spec's laboratory.
  v_count := (SELECT count(*)
              FROM public.quality_templates t
              JOIN public.client_qualities cq ON cq.template_id = t.id
              WHERE t.is_client_variant
                AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% client template copies are still on another laboratory than their spec''s', v_count;
  END IF;

  -- Four restrictive lab-scope policies, each on the right command and scope,
  -- each leaving base templates alone.
  v_count := (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = 'quality_templates'
                AND p.permissive = 'RESTRICTIVE'
                AND (   (p.policyname = 'quality_templates_lab_scope_select' AND p.cmd = 'SELECT'
                         AND p.qual LIKE '%NOT is_client_variant%' AND p.qual LIKE '%qc_read_scope_lab()%')
                     OR (p.policyname = 'quality_templates_lab_scope_insert' AND p.cmd = 'INSERT'
                         AND p.with_check LIKE '%NOT is_client_variant%' AND p.with_check LIKE '%qc_write_scope_lab()%')
                     OR (p.policyname = 'quality_templates_lab_scope_update' AND p.cmd = 'UPDATE'
                         AND p.qual LIKE '%NOT is_client_variant%' AND p.qual LIKE '%qc_write_scope_lab()%'
                         AND p.with_check LIKE '%NOT is_client_variant%' AND p.with_check LIKE '%qc_write_scope_lab()%')
                     OR (p.policyname = 'quality_templates_lab_scope_delete' AND p.cmd = 'DELETE'
                         AND p.qual LIKE '%NOT is_client_variant%' AND p.qual LIKE '%qc_write_scope_lab()%')));
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 restrictive lab-scope policies on quality_templates, found %', v_count;
  END IF;

  -- The updated_at trigger is on again.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.quality_templates'::regclass
                   AND tgname = 'update_quality_templates_updated_at'
                   AND tgenabled = 'O') THEN
    RAISE EXCEPTION 'the updated_at trigger of quality_templates is not enabled again';
  END IF;

  RAISE NOTICE 'Client template copies follow their spec''s laboratory: % copies moved, none left on another laboratory, 4 restrictive policies.',
    current_setting('template_copies_lab.moved');
END $$;

COMMIT;

-- Post-apply check (read-only):
-- SELECT
--  (SELECT count(*) FROM quality_templates WHERE is_client_variant) AS client_copies,          -- 88 on 2026-11-26
--  (SELECT count(*) FROM quality_templates t JOIN client_qualities cq ON cq.template_id = t.id
--     WHERE t.is_client_variant AND t.laboratory_id IS DISTINCT FROM cq.laboratory_id)
--     AS copies_off_their_spec_lab,                                                            -- 0 (50 before)
--  (SELECT count(*) FROM quality_templates WHERE is_client_variant AND laboratory_id IS NULL)
--     AS copies_without_lab,                                                                   -- 0 (50 before)
--  (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.quality_templates'::regclass
--     AND NOT polpermissive AND polname LIKE 'quality\_templates\_lab\_scope\_%') AS lab_policies, -- 4
--  (SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.quality_templates'::regclass
--     AND tgname = 'update_quality_templates_updated_at') AS updated_at_trigger;              -- O
