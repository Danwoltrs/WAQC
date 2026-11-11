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
-- Before applying, run this on its own and read the result:
--
--   SELECT indexdef FROM pg_indexes WHERE tablename = 'quality_templates';
--
-- A UNIQUE index on a name column (name, name_en, name_pt, name_es) would make
-- the copy fail on the duplicated names. If one exists, STOP and tell Daniel.
--
-- Old cupping cards printed before this migration carry the base template id
-- in their QR. Reprint cards for lots still waiting to be cupped.
--
-- Paste-safe for the Supabase editor. Apply BEFORE 20261111000001.

BEGIN;

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

-- Verification: expect shared_left = 0.
SELECT count(*) AS shared_left
FROM public.client_qualities cq JOIN public.quality_templates t ON t.id = cq.template_id
WHERE NOT t.is_client_variant
   OR (SELECT count(*) FROM public.client_qualities o WHERE o.template_id = cq.template_id) > 1;
