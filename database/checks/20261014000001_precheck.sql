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
SELECT 'staff who would flip to external (count)',
       count(*)::text
FROM public.profiles p
JOIN public.user_profiles up ON up.id = p.id
WHERE up.user_type = 'external'
  AND up.status IS DISTINCT FROM 'pending'
  AND p.qc_role IS NOT NULL
  AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer');
