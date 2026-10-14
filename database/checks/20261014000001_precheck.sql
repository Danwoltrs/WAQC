-- Pre-check for 20261014000001_portal_accounts_foundation.sql.
-- Read-only. Run it BEFORE the migration. One result set: check | value.

SELECT 'portal_invitations regclass' AS check_name,
       coalesce(to_regclass('public.portal_invitations')::text, 'absent') AS value
UNION ALL
SELECT 'pg_proc named waqc_access_kind / waqc_is_staff (count)',
       count(*)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
UNION ALL
SELECT 'definition ' || n.nspname || '.' || p.proname,
       pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('waqc_access_kind', 'waqc_is_staff')
UNION ALL
SELECT 'user_role enum labels (public)',
       coalesce((
         SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'user_role' AND n.nspname = 'public'
       ), 'absent')
UNION ALL
SELECT 'profiles.qc_role data type',
       coalesce((
         SELECT c.data_type || ' / ' || c.udt_name
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = 'profiles'
           AND c.column_name = 'qc_role'
       ), 'absent')
UNION ALL
SELECT 'staff-role profiles with qc_enabled not true (count)',
       count(*)::text
FROM public.profiles p
WHERE p.qc_role IS NOT NULL
  AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
  AND p.qc_enabled IS NOT TRUE
UNION ALL
SELECT 'affected staff: ' || coalesce(lower(btrim(p.email)), p.id::text),
       'qc_enabled=' || coalesce(p.qc_enabled::text, 'null')
         || '; user_profiles=' || coalesce((
              SELECT string_agg(up.user_type || '/' || coalesce(up.status, 'null'), ', ')
              FROM public.user_profiles up WHERE up.id = p.id
            ), 'none')
         || '; qc_role=' || p.qc_role::text
         || '; lab=' || coalesce(p.laboratory_id::text, 'none')
         || '; staff invitation=' || coalesce((
              SELECT CASE
                       WHEN bool_or(ui.status = 'accepted') THEN 'accepted'
                       WHEN bool_or(ui.status = 'pending') THEN 'pending'
                       ELSE 'other'
                     END
              FROM public.user_invitations ui
              WHERE lower(btrim(ui.email)) = lower(btrim(p.email))
                AND ui.qc_role IS NOT NULL
                AND ui.qc_role::text NOT IN ('client', 'supplier', 'buyer')
            ), 'none')
         || '; reason=' || CASE
              WHEN p.qc_enabled IS NOT TRUE THEN 'loses staff (qc_enabled not true)'
              ELSE 'cleanup would switch off (non-wolthers, no staff invitation)'
            END
         || '; sys grants=' || (
              SELECT count(*)::text FROM public.external_user_company_grants g WHERE g.user_id = p.id
            )
FROM public.profiles p
WHERE p.qc_role IS NOT NULL
  AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
  AND (
    p.qc_enabled IS NOT TRUE
    OR (
      lower(btrim(p.email)) NOT LIKE '%@wolthers.com'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_invitations ui
        WHERE lower(btrim(ui.email)) = lower(btrim(p.email))
          AND ui.qc_role IS NOT NULL
          AND ui.qc_role::text NOT IN ('client', 'supplier', 'buyer')
      )
    )
  );
