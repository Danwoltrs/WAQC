-- Read-only pre-check for 20261014000002_handle_new_user_no_stranger_profiles.sql.
-- Run this FIRST in the Supabase SQL editor. One result set, check | value.
-- If the live body differs from the base the migration was written against,
-- stop and tell the controller before pasting the migration.

SELECT 'handle_new_user live body' AS check,
       pg_get_functiondef('public.handle_new_user'::regproc) AS value
UNION ALL
SELECT 'profiles relrowsecurity',
       COALESCE((SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.profiles'::regclass), 'missing')
UNION ALL
SELECT 'user_profiles relrowsecurity',
       COALESCE((SELECT c.relrowsecurity::text FROM pg_class c WHERE c.oid = 'public.user_profiles'::regclass), 'missing')
UNION ALL
SELECT 'user_invitations.accepted_at present',
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_invitations' AND column_name = 'accepted_at')
UNION ALL
SELECT 'user_invitations.updated_at present',
       (SELECT count(*)::text FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_invitations' AND column_name = 'updated_at')
UNION ALL
SELECT 'profiles columns present (expect all 9)',
       COALESCE((SELECT string_agg(column_name, ', ' ORDER BY column_name)
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'profiles'
                   AND column_name IN ('is_cupper', 'is_q_grader', 'qc_enabled', 'is_global_admin',
                                       'laboratory_id', 'first_name', 'last_name', 'full_name', 'qc_role')),
                'none')
UNION ALL
SELECT 'profiles.qc_role data type',
       COALESCE((SELECT data_type || ' / ' || udt_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'qc_role'),
                'missing')
UNION ALL
SELECT 'laboratories SANTOS_HQ rows',
       (SELECT count(*)::text FROM public.laboratories WHERE code = 'SANTOS_HQ');
