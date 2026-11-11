-- Migration 20261111000000: a private template copy for every client quality
--
-- Client quality specifications become versioned per client (next file,
-- 20261111000001). A client's change must never reach another client, so every
-- client_qualities row gets its own private copy of its template
-- (is_client_variant = true, template_parent_id = the template it was copied
-- from, version 1). Rows that point at a shared template (a global one, or a
-- client variant used by more than one client quality) are repointed at their
-- new copy. Rows that already own a private variant alone are left as they are.
--
-- After this, Quality Templates edits no longer reach clients: each client
-- quality reads its own copy.
--
-- Visibility of the copies: a copy is is_global = false and inherits the
-- source's assigned_laboratories ('{}' on a global template) and created_by.
-- Under the SELECT policies of 042_fix_template_sharing_policies.sql such a
-- row is visible only to global admins and to its creator, so a lab user's
-- client quality -> template read would come back empty right after the copy
-- (grading and cupping would lose the spec). This paste therefore also adds
-- quality_templates_client_copy_select, a PERMISSIVE policy (permissive
-- policies are OR-ed, so it widens and narrows nothing). A WAQC staff profile
-- may read a template only when it is a client copy (is_client_variant) AND a
-- client quality uses it. That EXISTS runs under the caller's own
-- client_qualities RLS, so a copy is readable exactly when the client quality
-- that uses it is. Base templates keep the 042 rules unchanged. (An earlier
-- draft's blanket staff_select is dropped if present.)
--
-- Before applying, run these two on their own and read the results:
--
--   SELECT indexdef FROM pg_indexes WHERE tablename = 'quality_templates';
--
-- A UNIQUE index on a name column (name, name_en, name_pt, name_es) would make
-- the copy fail on the duplicated names. If one exists, STOP and tell Daniel.
--
--   SELECT policyname, permissive, cmd, qual FROM pg_policies
--   WHERE tablename = 'quality_templates';
--
-- Check the SELECT policies: a RESTRICTIVE SELECT policy would still hide the
-- copies from staff after this paste. If one exists, STOP and tell Daniel.
-- public.waqc_is_staff() must exist (20261014000001).
--
-- Old cupping cards printed before this migration carry the base template id
-- in their QR. Reprint cards for lots still waiting to be cupped.
--
-- Paste-safe for the Supabase editor. Apply BEFORE 20261111000001.

BEGIN;

DROP POLICY IF EXISTS quality_templates_waqc_staff_select ON public.quality_templates;
DROP POLICY IF EXISTS quality_templates_client_copy_select ON public.quality_templates;
CREATE POLICY quality_templates_client_copy_select ON public.quality_templates
  FOR SELECT TO authenticated
  USING (
    is_client_variant
    AND (SELECT public.waqc_is_staff())
    AND EXISTS (SELECT 1 FROM public.client_qualities cq WHERE cq.template_id = quality_templates.id)
  );

WITH targets AS (
  SELECT cq.id AS cq_id, cq.template_id, gen_random_uuid() AS new_id
  FROM public.client_qualities cq
  JOIN public.quality_templates t ON t.id = cq.template_id
  WHERE NOT t.is_client_variant
     OR (SELECT count(*) FROM public.client_qualities o WHERE o.template_id = cq.template_id) > 1
), copies AS (
  INSERT INTO public.quality_templates
  SELECT (jsonb_populate_record(NULL::public.quality_templates,
           to_jsonb(t) || jsonb_build_object(
             'id', tg.new_id, 'is_client_variant', true, 'is_global', false,
             'template_parent_id', t.id, 'version', 1,
             'created_at', now(), 'updated_at', now()))).*
  FROM targets tg JOIN public.quality_templates t ON t.id = tg.template_id
  RETURNING id
)
UPDATE public.client_qualities cq SET template_id = tg.new_id
FROM targets tg WHERE cq.id = tg.cq_id;

COMMIT;

-- Verification (one row): expect shared_left = 0, client_copy_select_policy = 1
-- and old_staff_select_policy = 0.
SELECT
  (SELECT count(*)
   FROM public.client_qualities cq JOIN public.quality_templates t ON t.id = cq.template_id
   WHERE NOT t.is_client_variant
      OR (SELECT count(*) FROM public.client_qualities o WHERE o.template_id = cq.template_id) > 1
  ) AS shared_left,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'quality_templates'
     AND policyname = 'quality_templates_client_copy_select' AND permissive = 'PERMISSIVE'
  ) AS client_copy_select_policy,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'quality_templates'
     AND policyname = 'quality_templates_waqc_staff_select'
  ) AS old_staff_select_policy;
