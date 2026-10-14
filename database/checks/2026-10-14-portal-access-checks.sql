-- Portal access checks: external users read nothing from the QC tables,
-- non-staff cannot write samples, staff still can, and the service-role-only
-- tables stay closed.
--
-- Read-only. Run each CHECK on its own (the editor shows only the last
-- result). CHECKs 1 to 3 run as real users (request.jwt.claims plus
-- SET LOCAL ROLE authenticated) inside a transaction that ends in ROLLBACK,
-- so the touch-updates in CHECKs 2 and 3 are never kept. The sample they try
-- to touch and the users are picked before the role switch.
--
-- Needs 20261014000001 (waqc_access_kind). Run CHECK 2 before and after
-- 20261014000005; CHECK 3 after 20261014000004 and again after
-- 20261014000005.
--
-- Paste-safe for the Supabase editor.

-- CHECK 1 — an external (client) user reads nothing from QC tables.
-- Expected: kind = external, every count 0.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.user_profiles WHERE user_type::text = 'external' AND status::text = 'active' ORDER BY id LIMIT 1),
                    'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.waqc_access_kind() AS kind,
       (SELECT count(*) FROM public.samples) AS samples,
       (SELECT count(*) FROM public.certificates) AS certificates,
       (SELECT count(*) FROM public.cupping_scores) AS cupping_scores,
       (SELECT count(*) FROM public.client_qualities) AS client_qualities,
       (SELECT count(*) FROM public.qc_client_settings) AS qc_client_settings;
ROLLBACK;

-- CHECK 2 — non-staff cannot write samples. Two subjects, one row each:
--   sys-only internal user: a user_profiles row of type internal and no WAQC
--     profile.
--   non-global staff role, qc_enabled not true: a profile with a staff role
--     other than global_admin / global_quality_admin, qc_enabled not true,
--     is_global_admin not true, and no disabled or external user_profiles
--     row. This is the group the new policies newly close: today's
--     "Lab personnel can update samples" lets them write.
-- subject_found = false means nobody matched and the row tests nothing.
-- Expected after 20261014000005: both rows kind = none, samples_updated = 0.
-- Before it: the non-global staff row is none | 1 (0 means the live read
-- policies already hide samples from that person); the sys-only row is 1
-- only where a live permissive policy lets such a user update samples
-- (BLOCK 1 of database/checks/2026-10-14-qc-table-writers.sql lists them).
BEGIN;
SELECT set_config('waqc_check.sample_id',
         (SELECT s.id::text FROM public.samples s ORDER BY s.created_at DESC LIMIT 1), true),
       set_config('waqc_check.sys_only_user',
         coalesce((SELECT up.id::text FROM public.user_profiles up LEFT JOIN public.profiles p ON p.id = up.id
                    WHERE p.id IS NULL AND up.user_type::text = 'internal' ORDER BY up.id LIMIT 1), ''), true),
       set_config('waqc_check.not_enabled_staff',
         coalesce((SELECT p.id::text FROM public.profiles p
                    WHERE p.qc_role IS NOT NULL
                      AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer', 'global_admin', 'global_quality_admin')
                      AND p.qc_enabled IS NOT TRUE
                      AND p.is_global_admin IS NOT TRUE
                      AND NOT EXISTS (SELECT 1 FROM public.user_profiles up
                                      WHERE up.id = p.id AND (up.status::text = 'disabled' OR up.user_type::text = 'external'))
                    ORDER BY p.created_at DESC LIMIT 1), ''), true);
SELECT set_config('request.jwt.claims',
         json_build_object('sub', nullif(current_setting('waqc_check.sys_only_user'), ''), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
WITH touched AS (
  UPDATE public.samples SET updated_at = updated_at
  WHERE id = current_setting('waqc_check.sample_id')::uuid
  RETURNING id
)
SELECT set_config('waqc_check.sys_only_kind', public.waqc_access_kind(), true),
       set_config('waqc_check.sys_only_updated', (SELECT count(*) FROM touched)::text, true);
SELECT set_config('request.jwt.claims',
         json_build_object('sub', nullif(current_setting('waqc_check.not_enabled_staff'), ''), 'role', 'authenticated')::text, true);
WITH touched AS (
  UPDATE public.samples SET updated_at = updated_at
  WHERE id = current_setting('waqc_check.sample_id')::uuid
  RETURNING id
)
SELECT 'sys-only internal user' AS subject,
       current_setting('waqc_check.sys_only_user') <> '' AS subject_found,
       current_setting('waqc_check.sys_only_kind') AS kind,
       current_setting('waqc_check.sys_only_updated')::bigint AS samples_updated
UNION ALL
SELECT 'non-global staff role, qc_enabled not true',
       current_setting('waqc_check.not_enabled_staff') <> '',
       public.waqc_access_kind(),
       (SELECT count(*) FROM touched);
ROLLBACK;

-- CHECK 3 — staff still write. The subject is an enabled lab_personnel
-- profile whose sys account is not disabled.
-- Expected: kind = staff, samples_updated = 1.
BEGIN;
SELECT set_config('waqc_check.sample_id',
         (SELECT s.id::text FROM public.samples s ORDER BY s.created_at DESC LIMIT 1), true),
       set_config('request.jwt.claims',
         json_build_object('sub', (SELECT p.id FROM public.profiles p
                                    WHERE p.qc_role::text = 'lab_personnel' AND p.qc_enabled IS TRUE
                                      AND NOT EXISTS (SELECT 1 FROM public.user_profiles up
                                                      WHERE up.id = p.id AND up.status::text = 'disabled')
                                    ORDER BY p.created_at LIMIT 1),
                           'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
WITH touched AS (
  UPDATE public.samples SET updated_at = updated_at
  WHERE id = current_setting('waqc_check.sample_id')::uuid
  RETURNING id
)
SELECT public.waqc_access_kind() AS kind, (SELECT count(*) FROM touched) AS samples_updated;
ROLLBACK;

-- CHECK 4 — the service-role-only tables: RLS on, no policies, no rights
-- for anon or authenticated. Expected: two rows, every column true.
SELECT t.table_name,
       c.relrowsecurity AS rls_on,
       NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.table_name) AS no_policies,
       NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS anon_none,
       NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS authenticated_none
FROM (VALUES ('portal_invitations'), ('qc_portal_access')) AS t(table_name)
JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name);
