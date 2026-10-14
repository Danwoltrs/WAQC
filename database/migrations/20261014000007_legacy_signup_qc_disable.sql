-- Switch off WAQC access for accounts that got a staff role from the old open
-- sign-up.
--
-- Why: before 20261014000002 every sign-in without an invitation got a
-- lab_personnel profile. WAQC now treats a staff role as staff only when
-- profiles.qc_enabled is true (waqc_access_kind). This sets qc_enabled to
-- false for staff-role profiles that are neither @wolthers.com nor tied to any
-- staff-role invitation (any status).
--
-- Read the "would be external" / staff list from
-- database/checks/20261014000001_precheck.sql FIRST. Add any real staff the
-- list shows to the keep CTE below, then run this.
--
-- Paste-safe for the Supabase editor.

WITH keep AS (
  -- Emails to protect, lowercase. To add one:
  --   UNION ALL SELECT 'name@lab.com'
  SELECT NULL::text AS email WHERE false
),
changed AS (
  UPDATE public.profiles p
  SET qc_enabled = false, updated_at = now()
  WHERE p.qc_enabled IS TRUE
    AND p.qc_role IS NOT NULL
    AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    AND lower(btrim(p.email)) NOT LIKE '%@wolthers.com'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE lower(btrim(ui.email)) = lower(btrim(p.email))
        AND ui.qc_role IS NOT NULL
        AND ui.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    )
    AND lower(btrim(p.email)) NOT IN (SELECT k.email FROM keep k WHERE k.email IS NOT NULL)
  RETURNING p.id, p.email
)
SELECT
  (SELECT count(*) FROM changed) AS switched_off,
  coalesce((SELECT string_agg(c.email, ', ' ORDER BY c.email) FROM changed c), 'none') AS emails;
