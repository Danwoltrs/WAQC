-- Writes to the sample, certificate, grading and cupping tables need a WAQC
-- staff profile. Apply after 20261014000004 has run for a day without trouble.
--
-- RESTRICTIVE, so it narrows the existing permissive policies instead of
-- replacing them. Service-role routes (cupping finalize, CVA, cupper
-- assignment, approve-with-comments, certify after grading, the sys decision
-- write-back) and SECURITY DEFINER functions (the sys mirror trigger,
-- soft_delete_sample, void_certificate, certificate numbering) bypass RLS and
-- are unaffected. sys writes samples only with the service role (sys intake,
-- the sample-email classifier). The writer inventory and the pre-checks are
-- in database/checks/2026-10-14-qc-table-writers.sql: run BLOCK 4 and BLOCK 5
-- again before this one. A blocked update saves nothing and raises no error,
-- so anyone BLOCK 5 lists who should keep working needs qc_enabled first.
-- Only the *_waqc_staff_* policies below are dropped and recreated.
--
-- Paste-safe for the Supabase editor.

BEGIN;

DROP POLICY IF EXISTS samples_waqc_staff_insert ON public.samples;
CREATE POLICY samples_waqc_staff_insert ON public.samples AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS samples_waqc_staff_update ON public.samples;
CREATE POLICY samples_waqc_staff_update ON public.samples AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS samples_waqc_staff_delete ON public.samples;
CREATE POLICY samples_waqc_staff_delete ON public.samples AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS certificates_waqc_staff_insert ON public.certificates;
CREATE POLICY certificates_waqc_staff_insert ON public.certificates AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS certificates_waqc_staff_update ON public.certificates;
CREATE POLICY certificates_waqc_staff_update ON public.certificates AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS certificates_waqc_staff_delete ON public.certificates;
CREATE POLICY certificates_waqc_staff_delete ON public.certificates AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS quality_assessments_waqc_staff_insert ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_insert ON public.quality_assessments AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_assessments_waqc_staff_update ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_update ON public.quality_assessments AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_assessments_waqc_staff_delete ON public.quality_assessments;
CREATE POLICY quality_assessments_waqc_staff_delete ON public.quality_assessments AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS cupping_sessions_waqc_staff_insert ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_insert ON public.cupping_sessions AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_sessions_waqc_staff_update ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_update ON public.cupping_sessions AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_sessions_waqc_staff_delete ON public.cupping_sessions;
CREATE POLICY cupping_sessions_waqc_staff_delete ON public.cupping_sessions AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS cupping_scores_waqc_staff_insert ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_insert ON public.cupping_scores AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_scores_waqc_staff_update ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_update ON public.cupping_scores AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS cupping_scores_waqc_staff_delete ON public.cupping_scores;
CREATE POLICY cupping_scores_waqc_staff_delete ON public.cupping_scores AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

COMMIT;

-- Verification: 24 rows with 20261014000004 applied (9 + 15).
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_waqc\_staff\_%'
ORDER BY tablename, cmd;
