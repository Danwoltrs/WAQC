-- Combined pre-check for portal SQL 20261014000001, 000002 and 000006.
-- READ-ONLY: a single SELECT, it changes nothing.
-- Run it BEFORE applying 000001, 000002 and 000006, in the Supabase SQL
-- editor, then paste the FULL result back.
--
-- One result set, three text columns: section (which pre-check: 000001,
-- 000002 or 000006) | item (the row label) | value.
-- Rows come out sorted by section, then in the order each source file lists
-- them. Labels and values are the same as in database/checks/<id>_precheck.sql
-- (the 000001 section numbers 1 to 6 of that file are kept as its row order).
--
-- Emails come from auth.users (the sign-in address), never from
-- profiles.email, which the person can edit themselves.
-- Staff after 000001: is_global_admin, or a staff role (not client, supplier,
-- buyer) with qc_enabled true or a global role (global_admin,
-- global_quality_admin). A disabled sys account is none before that.

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
SELECT x.section, x.item, x.value
FROM (
  SELECT '000001' AS section, 1 AS ord,
         'portal_invitations regclass' AS item,
         coalesce(to_regclass('public.portal_invitations')::text, 'absent') AS value
  UNION ALL
  SELECT '000001', 1,
         'pg_proc named waqc_access_kind / waqc_is_staff (count)',
         count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
  UNION ALL
  SELECT '000001', 1,
         'definition ' || n.nspname || '.' || p.proname,
         pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
  UNION ALL
  SELECT '000001', 1,
         'user_role enum labels (public)',
         coalesce((
           SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
           JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'user_role' AND n.nspname = 'public'
         ), 'absent')
  UNION ALL
  SELECT '000001', 1,
         'profiles.qc_role data type',
         coalesce((
           SELECT c.data_type || ' / ' || c.udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'profiles'
             AND c.column_name = 'qc_role'
         ), 'absent')
  UNION ALL
  SELECT '000001', 2,
         'non-global staff-role profiles with qc_enabled not true (count, they lose the staff kind)',
         count(*)::text
  FROM person
  WHERE staff_role AND NOT global_role AND NOT enabled
  UNION ALL
  SELECT '000001', 3, 'loses staff kind (non-global staff role, qc_enabled not true): ' || email, detail
  FROM person
  WHERE staff_role AND NOT global_role AND NOT enabled
  UNION ALL
  SELECT '000001', 4, 'stays staff (external sys row or sys grants): ' || email, detail
  FROM person
  WHERE is_staff
    AND sys_status IS DISTINCT FROM 'disabled'
    AND (sys_type = 'external' OR sys_grants > 0)
  UNION ALL
  SELECT '000001', 5, 'becomes none (staff, sys account disabled): ' || email, detail
  FROM person
  WHERE is_staff AND sys_status = 'disabled'
  UNION ALL
  SELECT '000001', 6, 'global admin, staff by the global route (confirm genuine): ' || email, detail
  FROM person
  WHERE global_role
  UNION ALL
  SELECT '000002', 1, 'handle_new_user live body',
         pg_get_functiondef('public.handle_new_user'::regproc)
  UNION ALL
  SELECT '000002', 2, 'profiles relrowsecurity',
         COALESCE((SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.profiles'::regclass), 'missing')
  UNION ALL
  SELECT '000002', 3, 'user_profiles relrowsecurity',
         COALESCE((SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.user_profiles'::regclass), 'missing')
  UNION ALL
  SELECT '000002', 4, 'user_invitations.accepted_at present',
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_invitations' AND column_name = 'accepted_at')
  UNION ALL
  SELECT '000002', 5, 'user_invitations.updated_at present',
         (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'user_invitations' AND column_name = 'updated_at')
  UNION ALL
  SELECT '000002', 6, 'profiles columns present (expect all 9)',
         COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                   FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'profiles'
                     AND column_name IN ('is_cupper', 'is_q_grader', 'qc_enabled', 'is_global_admin',
                                         'laboratory_id', 'first_name', 'last_name', 'full_name', 'qc_role')),
                  'none')
  UNION ALL
  SELECT '000002', 7, 'profiles.qc_role data type',
         COALESCE((SELECT data_type || ' / ' || udt_name FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'qc_role'),
                  'missing')
  UNION ALL
  SELECT '000002', 8, 'laboratories SANTOS_HQ rows',
         (SELECT count(*)::text FROM public.laboratories WHERE code = 'SANTOS_HQ')
  UNION ALL
  SELECT '000006', 1, 'qc_portal_access regclass',
         coalesce(to_regclass('public.qc_portal_access')::text, 'absent')
  UNION ALL
  SELECT '000006', 2, 'pg_proc named qc_keys_only (count)',
         count(*)::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'qc_keys_only'
  UNION ALL
  SELECT '000006', 3, 'user_profiles.id data type',
         coalesce((
           SELECT c.data_type FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.table_name = 'user_profiles' AND c.column_name = 'id'
         ), 'absent')
  UNION ALL
  SELECT '000006', 4, 'user_profiles primary key',
         coalesce((
           SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
           WHERE k.conrelid = to_regclass('public.user_profiles') AND k.contype = 'p'
         ), 'absent')
  UNION ALL
  SELECT '000006', 5, 'companies.id data type',
         coalesce((
           SELECT c.data_type FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.table_name = 'companies' AND c.column_name = 'id'
         ), 'absent')
  UNION ALL
  SELECT '000006', 6, 'companies primary key',
         coalesce((
           SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
           WHERE k.conrelid = to_regclass('public.companies') AND k.contype = 'p'
         ), 'absent')
  UNION ALL
  SELECT '000006', 7, 'auth.users regclass',
         coalesce(to_regclass('auth.users')::text, 'absent')
) x
ORDER BY x.section, x.ord, x.item;
