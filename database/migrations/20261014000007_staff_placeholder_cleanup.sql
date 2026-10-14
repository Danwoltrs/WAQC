-- Remove sys's pending "external" placeholder from genuine invited staff.
--
-- Why: waqc_access_kind() treats a user_profiles row with user_type 'external'
-- (any status) as external, and external always wins. Real non-wolthers lab
-- staff who were invited to WAQC before the sign-up trigger changed
-- (20261014000002) carry that placeholder and would be locked out.
--
-- Run database/checks/20261014000001_precheck.sql first and read the
-- "would be external" list. This deletes ONLY user_profiles rows where ALL hold:
--   * user_type = 'external' and status = 'pending'
--   * no external_user_company_grants rows for the user
--   * no portal_activity rows for the user
--   * the user has a public.profiles row with a staff qc_role
--   * an ACCEPTED staff-role user_invitations row exists for the same email
--     (lower(btrim) compare)
-- Legacy accounts that got a role from the old open sign-up have no accepted
-- staff invitation, so they stay blocked. The final result also counts staff
-- profiles that still have an external row; Daniel decides about those.
--
-- Paste-safe for the Supabase editor.

WITH removed AS (
  DELETE FROM public.user_profiles up
  WHERE up.user_type = 'external'
    AND up.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.external_user_company_grants g WHERE g.user_id = up.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.portal_activity a WHERE a.user_id = up.id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = up.id
        AND p.qc_role IS NOT NULL
        AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_invitations ui
      WHERE lower(btrim(ui.email)) = lower(btrim(up.email))
        AND ui.status = 'accepted'
        AND ui.qc_role IS NOT NULL
        AND ui.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    )
  RETURNING up.id
)
SELECT
  (SELECT count(*) FROM removed) AS removed_placeholders,
  (SELECT count(*)
   FROM public.profiles p
   JOIN public.user_profiles up2 ON up2.id = p.id
   WHERE up2.user_type = 'external'
     AND p.qc_role IS NOT NULL
     AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')) AS staff_still_external;
