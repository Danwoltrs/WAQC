-- Read-only pre-check for 20261014000008_guard_global_requires_enabled.sql.
-- Run this FIRST in the Supabase SQL editor. One result set, check | value.
-- The live guard body should equal 20261014000000_guard_profile_privilege_columns.sql;
-- if it differs, stop and tell the controller before pasting the migration.
-- The people the change affects (global-role rows with qc_enabled not true)
-- are listed one per row in database/checks/20261014000001_precheck.sql.

SELECT 'guard_profile_privilege_columns live body' AS check,
       coalesce((
         SELECT pg_get_functiondef(p.oid)
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'guard_profile_privilege_columns'
         LIMIT 1
       ), 'absent') AS value
UNION ALL
SELECT 'profiles trigger ' || t.tgname,
       pg_get_triggerdef(t.oid) || ' (enabled=' || t.tgenabled::text || ')'
FROM pg_trigger t
WHERE t.tgrelid = 'public.profiles'::regclass
  AND NOT t.tgisinternal
UNION ALL
SELECT 'global-role profiles with qc_enabled not true (count)',
       count(*)::text
FROM public.profiles p
WHERE (p.is_global_admin IS TRUE OR p.qc_role::text IN ('global_admin', 'global_quality_admin'))
  AND p.qc_enabled IS NOT TRUE;
