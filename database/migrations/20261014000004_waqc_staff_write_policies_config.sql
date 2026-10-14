-- Writes to the QC configuration tables need a WAQC staff profile
-- (waqc_is_staff, migration 20261014000001). RESTRICTIVE, so it narrows the
-- existing permissive policies instead of replacing them. Service-role routes
-- bypass RLS and are unaffected.
--
-- Before applying:
--   1. 20261014000001 is applied (CREATE POLICY fails on a missing
--      waqc_is_staff(), and nothing is kept).
--   2. Run database/checks/2026-10-14-qc-table-writers.sql, each block on its
--      own, and read its writer inventory. No writer of these tables runs as
--      a non-staff signed-in user; every session-client writer is a staff
--      route. BLOCK 5 lists recent writers who would fail the staff test
--      (the test of 20261014000001: global admins pass without qc_enabled,
--      other staff need it): fix their qc_enabled first or accept they lose
--      write access (a blocked update saves nothing and raises no error).
-- 20261014000005 (the sample tables) follows only AFTER the WAQC branch with
-- the access-kind middleware is deployed: on a main without it, non-enabled
-- staff still reach every page and their sample, grading and cupping saves
-- would silently do nothing.
-- Only the *_waqc_staff_* policies below are dropped and recreated; every
-- other policy, sys's RESTRICTIVE *_deny ones included, is left alone.
--
-- Paste-safe for the Supabase editor.

BEGIN;

DROP POLICY IF EXISTS client_qualities_waqc_staff_insert ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_insert ON public.client_qualities AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS client_qualities_waqc_staff_update ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_update ON public.client_qualities AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS client_qualities_waqc_staff_delete ON public.client_qualities;
CREATE POLICY client_qualities_waqc_staff_delete ON public.client_qualities AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS quality_templates_waqc_staff_insert ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_insert ON public.quality_templates AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_templates_waqc_staff_update ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_update ON public.quality_templates AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS quality_templates_waqc_staff_delete ON public.quality_templates;
CREATE POLICY quality_templates_waqc_staff_delete ON public.quality_templates AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS qc_client_settings_waqc_staff_insert ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_insert ON public.qc_client_settings AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS qc_client_settings_waqc_staff_update ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_update ON public.qc_client_settings AS RESTRICTIVE
  FOR UPDATE TO authenticated USING ((SELECT public.waqc_is_staff())) WITH CHECK ((SELECT public.waqc_is_staff()));
DROP POLICY IF EXISTS qc_client_settings_waqc_staff_delete ON public.qc_client_settings;
CREATE POLICY qc_client_settings_waqc_staff_delete ON public.qc_client_settings AS RESTRICTIVE
  FOR DELETE TO authenticated USING ((SELECT public.waqc_is_staff()));

COMMIT;

-- Verification: nine rows.
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%\_waqc\_staff\_%'
ORDER BY tablename, cmd;
