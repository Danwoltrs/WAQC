-- Pre-check for 20261014000006_qc_portal_access.sql.
-- Read-only. Run it BEFORE the migration. One result set: check | value.
-- Expected: qc_portal_access absent (present when re-running), no
-- qc_keys_only function yet (1 when re-running), both id columns uuid and
-- each the whole primary key, auth.users present.

SELECT 'qc_portal_access regclass' AS check_name,
       coalesce(to_regclass('public.qc_portal_access')::text, 'absent') AS value
UNION ALL
SELECT 'pg_proc named qc_keys_only (count)',
       count(*)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'qc_keys_only'
UNION ALL
SELECT 'user_profiles.id data type',
       coalesce((
         SELECT c.data_type FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'user_profiles' AND c.column_name = 'id'
       ), 'absent')
UNION ALL
SELECT 'user_profiles primary key',
       coalesce((
         SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.user_profiles') AND k.contype = 'p'
       ), 'absent')
UNION ALL
SELECT 'companies.id data type',
       coalesce((
         SELECT c.data_type FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = 'companies' AND c.column_name = 'id'
       ), 'absent')
UNION ALL
SELECT 'companies primary key',
       coalesce((
         SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.companies') AND k.contype = 'p'
       ), 'absent')
UNION ALL
SELECT 'auth.users regclass',
       coalesce(to_regclass('auth.users')::text, 'absent');
