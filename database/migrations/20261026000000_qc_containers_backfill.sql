-- Gives the new Containers view to everyone who can already see the Overview (spec §3).
BEGIN;
UPDATE public.qc_portal_access
   SET views = array_append(views, 'qc_containers')
 WHERE 'qc_dashboard' = ANY(views)
   AND NOT ('qc_containers' = ANY(views));
COMMIT;
-- Verification: 0 = done.
SELECT count(*) AS missing FROM public.qc_portal_access
 WHERE 'qc_dashboard' = ANY(views) AND NOT ('qc_containers' = ANY(views));
