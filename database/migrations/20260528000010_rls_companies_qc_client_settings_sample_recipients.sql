-- Migration 20260528000010
-- Phase 9: RLS for the post-consolidation tables.
--   1. Helper function: can_user_manage_sample(user_id, sample_id) → boolean
--      Mirrors src/lib/auth/sample-access.ts (defence in depth — application
--      already enforces this, but RLS guards direct DB access too).
--   2. companies: WAQC-side policies (additive — sys.wolthers.com's existing
--      policies stay untouched). Auth users can read; staff can write.
--   3. qc_client_settings: same pattern as companies.
--   4. sample_recipients: replace the permissive "any authenticated user" policies
--      with ones that match the application-layer authorization rule.
--
-- Naming convention: WAQC policies are prefixed `waqc_` so they're easy to
-- distinguish from sys.wolthers.com policies on the shared companies table.

BEGIN;

-- 1. Helper function ---------------------------------------------------------

-- STAFF_SAMPLE_MANAGER_ROLES in TS — keep in sync if you ever change one.
-- SECURITY DEFINER so the function runs as the table owner, bypassing the
-- caller's RLS when reading profiles + samples. Without this, the function
-- could recursively invoke RLS on samples (and any policy on samples that
-- references sample_recipients would loop).
CREATE OR REPLACE FUNCTION can_user_manage_sample(p_user_id uuid, p_sample_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_sample  RECORD;
BEGIN
  IF p_user_id IS NULL OR p_sample_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id, qc_role, is_global_admin, laboratory_id, client_id
    INTO v_profile
    FROM profiles
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Rule 1 + 2: staff bypass
  IF v_profile.is_global_admin = true
     OR v_profile.qc_role IN ('global_admin', 'global_quality_admin',
                              'lab_quality_manager', 'lab_personnel') THEN
    RETURN true;
  END IF;

  -- Rules 3 + 4: client / lab membership
  SELECT client_id, end_client_id, laboratory_id
    INTO v_sample
    FROM samples
   WHERE id = p_sample_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_profile.client_id IS NOT NULL
     AND (v_sample.client_id = v_profile.client_id
          OR v_sample.end_client_id = v_profile.client_id) THEN
    RETURN true;
  END IF;

  IF v_profile.laboratory_id IS NOT NULL
     AND v_sample.laboratory_id = v_profile.laboratory_id THEN
    RETURN true;
  END IF;

  RETURN false;
END $$;

COMMENT ON FUNCTION can_user_manage_sample(uuid, uuid) IS
  'Mirrors src/lib/auth/sample-access.ts. SECURITY DEFINER to avoid RLS recursion. Used by sample_recipients policies.';

-- Similar predicate used in 3 of the 4 RLS verbs on companies + qc_client_settings —
-- pulled into a helper so each policy is one line, and so the role list lives in
-- exactly one place per migration.
CREATE OR REPLACE FUNCTION is_waqc_staff(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  SELECT qc_role, is_global_admin
    INTO v_profile
    FROM profiles
   WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN v_profile.is_global_admin = true
      OR v_profile.qc_role IN ('global_admin', 'global_quality_admin',
                               'lab_quality_manager', 'lab_personnel');
END $$;

COMMENT ON FUNCTION is_waqc_staff(uuid) IS
  'True if the user has a Wolthers QC staff role allowed to manage company/QC-settings rows.';


-- 2. companies RLS (additive) ------------------------------------------------

-- Make sure RLS is on. Other systems sharing this table (sys.wolthers.com)
-- may already have enabled it; the statement is a no-op in that case.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- WAQC SELECT: any authenticated user can read. Sample intake counterparty
-- pickers, dashboards, and reports all need broad read access.
DROP POLICY IF EXISTS waqc_companies_select ON companies;
CREATE POLICY waqc_companies_select
  ON companies FOR SELECT
  USING (auth.role() = 'authenticated');

-- WAQC INSERT/UPDATE: staff only. sys.wolthers.com staff already manage rows
-- under their own policies; this is the WAQC-side equivalent.
DROP POLICY IF EXISTS waqc_companies_insert ON companies;
CREATE POLICY waqc_companies_insert
  ON companies FOR INSERT
  WITH CHECK (is_waqc_staff(auth.uid()));

DROP POLICY IF EXISTS waqc_companies_update ON companies;
CREATE POLICY waqc_companies_update
  ON companies FOR UPDATE
  USING (is_waqc_staff(auth.uid()))
  WITH CHECK (is_waqc_staff(auth.uid()));

-- Intentionally no WAQC DELETE policy. Companies are shared with sys —
-- destructive operations should be coordinated, not granted as an everyday
-- WAQC staff power. If you need to delete, do it via the sys side or as
-- a one-off admin task with elevated credentials.


-- 3. qc_client_settings RLS --------------------------------------------------

ALTER TABLE qc_client_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waqc_qc_client_settings_select ON qc_client_settings;
CREATE POLICY waqc_qc_client_settings_select
  ON qc_client_settings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS waqc_qc_client_settings_insert ON qc_client_settings;
CREATE POLICY waqc_qc_client_settings_insert
  ON qc_client_settings FOR INSERT
  WITH CHECK (is_waqc_staff(auth.uid()));

DROP POLICY IF EXISTS waqc_qc_client_settings_update ON qc_client_settings;
CREATE POLICY waqc_qc_client_settings_update
  ON qc_client_settings FOR UPDATE
  USING (is_waqc_staff(auth.uid()))
  WITH CHECK (is_waqc_staff(auth.uid()));

DROP POLICY IF EXISTS waqc_qc_client_settings_delete ON qc_client_settings;
CREATE POLICY waqc_qc_client_settings_delete
  ON qc_client_settings FOR DELETE
  USING (is_waqc_staff(auth.uid()));


-- 4. sample_recipients RLS (tighten) -----------------------------------------

-- Drop the permissive "any authenticated user" policies seeded by
-- migration 20260525000000.
DROP POLICY IF EXISTS "Authenticated users can read sample recipients"   ON sample_recipients;
DROP POLICY IF EXISTS "Authenticated users can insert sample recipients" ON sample_recipients;
DROP POLICY IF EXISTS "Authenticated users can update sample recipients" ON sample_recipients;
DROP POLICY IF EXISTS "Authenticated users can delete sample recipients" ON sample_recipients;

-- New policies: must be the kind of user who would pass the app-layer
-- canUserManageSample check for the sample this row belongs to.
DROP POLICY IF EXISTS sample_recipients_select ON sample_recipients;
CREATE POLICY sample_recipients_select
  ON sample_recipients FOR SELECT
  USING (can_user_manage_sample(auth.uid(), sample_id));

DROP POLICY IF EXISTS sample_recipients_insert ON sample_recipients;
CREATE POLICY sample_recipients_insert
  ON sample_recipients FOR INSERT
  WITH CHECK (can_user_manage_sample(auth.uid(), sample_id));

DROP POLICY IF EXISTS sample_recipients_update ON sample_recipients;
CREATE POLICY sample_recipients_update
  ON sample_recipients FOR UPDATE
  USING (can_user_manage_sample(auth.uid(), sample_id))
  WITH CHECK (can_user_manage_sample(auth.uid(), sample_id));

DROP POLICY IF EXISTS sample_recipients_delete ON sample_recipients;
CREATE POLICY sample_recipients_delete
  ON sample_recipients FOR DELETE
  USING (can_user_manage_sample(auth.uid(), sample_id));

COMMIT;
