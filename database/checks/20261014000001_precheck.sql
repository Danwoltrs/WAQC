-- Pre-check for 20261014000001_portal_accounts_foundation.sql.
-- Read-only. Run it BEFORE the migration. One result set: check_name | value,
-- sorted by section.
--
-- Emails come from auth.users (the sign-in address), never from
-- profiles.email, which the person can edit themselves.
--
-- Staff after the migration: is_global_admin, or a staff role (not client,
-- supplier, buyer) with qc_enabled true or a global role (global_admin,
-- global_quality_admin). A disabled sys account is none before that.
--
-- Sections:
--   1  schema facts: portal_invitations, live definitions, user_role labels,
--      the profiles.qc_role type
--   2  count of non-global staff-role profiles with qc_enabled not true
--   3  one row each for those: they lose the staff kind (they become
--      external if sys holds an external row for them, else none)
--   4  one row per staff profile that holds an external user_profiles row or
--      sys company grant rows: they stay staff
--   5  one row per staff profile whose sys account is disabled: they become
--      none (a disabled sys account switches WAQC off too)
--   6  one row per profile that is staff by the global route
--      (is_global_admin, global_admin, global_quality_admin), whatever
--      qc_enabled says: confirm each is a genuine global admin (users could
--      raise their own role until the guard of 2026-10-14)
-- Each person row value lists qc_role, qc_enabled, is_global_admin, sys account
-- (user_profiles type/status, or none), lab, staff invitation state, latest
-- access request, sys grant count, profile id.

WITH person AS (
  SELECT
    coalesce(lower(btrim(u.email)), '') AS email,
    (p.qc_role IS NOT NULL AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')) AS staff_role,
    (p.qc_enabled IS TRUE) AS enabled,
    (p.is_global_admin IS TRUE
      OR coalesce(p.qc_role::text, '') IN ('global_admin', 'global_quality_admin')) AS global_role,
    (p.is_global_admin IS TRUE
      OR coalesce(p.qc_role::text, '') IN ('global_admin', 'global_quality_admin')
      OR (p.qc_role IS NOT NULL
          AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
          AND p.qc_enabled IS TRUE)) AS is_staff,
    up.user_type::text AS sys_type,
    up.status::text AS sys_status,
    grants.n AS sys_grants,
    'qc_role=' || coalesce(p.qc_role::text, 'null')
      || '; qc_enabled=' || coalesce(p.qc_enabled::text, 'null')
      || '; is_global_admin=' || coalesce(p.is_global_admin::text, 'null')
      || '; sys account=' || coalesce(up.user_type::text || '/' || coalesce(up.status::text, 'null'), 'none')
      || '; lab=' || coalesce(
           (SELECT l.code FROM public.laboratories l WHERE l.id = p.laboratory_id),
           p.laboratory_id::text,
           'none')
      || '; staff invitation=' || invitation.state
      || '; access request=' || coalesce(request.latest, 'none')
      || '; sys grants=' || grants.n::text
      || '; profile id=' || p.id::text AS detail
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_profiles up ON up.id = p.id
  CROSS JOIN LATERAL (
    SELECT count(*) AS n
    FROM public.external_user_company_grants g
    WHERE g.user_id = p.id
  ) grants
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN count(*) = 0 THEN 'none'
             WHEN bool_or(ui.status::text = 'accepted') THEN 'accepted'
             WHEN bool_or(ui.status::text = 'pending') THEN 'pending'
             ELSE 'other'
           END AS state
    FROM public.user_invitations ui
    WHERE lower(btrim(ui.email)) = coalesce(lower(btrim(u.email)), '')
      AND ui.qc_role IS NOT NULL
      AND ui.qc_role::text NOT IN ('client', 'supplier', 'buyer')
  ) invitation
  LEFT JOIN LATERAL (
    SELECT coalesce(ar.status::text, 'null')
             || coalesce(' ' || to_char(ar.created_at, 'YYYY-MM-DD'), '') AS latest
    FROM public.access_requests ar
    WHERE ar.user_id = p.id
    ORDER BY ar.created_at DESC NULLS LAST, ar.id DESC
    LIMIT 1
  ) request ON true
)
SELECT r.check_name, r.value
FROM (
  SELECT 1 AS section,
         'portal_invitations regclass' AS check_name,
         coalesce(to_regclass('public.portal_invitations')::text, 'absent') AS value
  UNION ALL
  SELECT 1,
         'pg_proc named waqc_access_kind / waqc_is_staff (count)',
         count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
  UNION ALL
  SELECT 1,
         'definition ' || n.nspname || '.' || p.proname,
         pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
  UNION ALL
  SELECT 1,
         'user_role enum labels (public)',
         coalesce((
           SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'user_role' AND n.nspname = 'public'
         ), 'absent')
  UNION ALL
  SELECT 1,
         'profiles.qc_role data type',
         coalesce((
           SELECT c.data_type || ' / ' || c.udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'profiles'
             AND c.column_name = 'qc_role'
         ), 'absent')
  UNION ALL
  SELECT 2,
         'non-global staff-role profiles with qc_enabled not true (count, they lose the staff kind)',
         count(*)::text
  FROM person
  WHERE staff_role AND NOT global_role AND NOT enabled
  UNION ALL
  SELECT 3, 'loses staff kind (non-global staff role, qc_enabled not true): ' || email, detail
  FROM person
  WHERE staff_role AND NOT global_role AND NOT enabled
  UNION ALL
  SELECT 4, 'stays staff (external sys row or sys grants): ' || email, detail
  FROM person
  WHERE is_staff
    AND sys_status IS DISTINCT FROM 'disabled'
    AND (sys_type = 'external' OR sys_grants > 0)
  UNION ALL
  SELECT 5, 'becomes none (staff, sys account disabled): ' || email, detail
  FROM person
  WHERE is_staff AND sys_status = 'disabled'
  UNION ALL
  SELECT 6, 'global admin, staff by the global route (confirm genuine): ' || email, detail
  FROM person
  WHERE global_role
) r
ORDER BY r.section, r.check_name;
