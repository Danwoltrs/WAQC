-- QC portal access (spec 2026-10-14-client-portal-accounts-design.md §5.1;
-- ruling R11 of 2026-10-14).
--
-- One row per person and company: the QC portal pages (views) and actions
-- (capabilities) that person has for that company. qc_manage_users in
-- capabilities makes them the company's QC admin. Only qc_ keys are stored.
--
-- Why WAQC's own table: sys opens a company's data (contracts with prices,
-- documents, shipments) to anyone who has a row for that company in its
-- company grants table, whatever keys the row holds, and copies rows to
-- sister companies. A grant row holding only qc_ keys would therefore open
-- sys data to a QC-only client. QC access lives here instead; WAQC never
-- reads or writes sys's grants.
--
-- Identity stays on sys's model: user_id is the person's user_profiles row
-- (user_type 'external'). Deleting the person or the company deletes their
-- QC access with it.
--
-- Service role only: RLS on, no policies, no rights for anon or
-- authenticated.
--
-- Run database/checks/20261014000006_precheck.sql first and read its result.
-- Apply together with 20261014000001, before the WAQC push.
--
-- Paste-safe for the Supabase editor; safe to run again.

-- True when every element is a QC key: qc_ followed by lowercase letters,
-- digits or underscores (the key format of src/lib/portal/qc-keys.ts). An
-- empty array passes; a NULL element does not.
CREATE OR REPLACE FUNCTION public.qc_keys_only(keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(bool_and(coalesce(k ~ '^qc_[a-z0-9_]+$', false)), true)
  FROM unnest(keys) AS k
$$;

CREATE TABLE IF NOT EXISTS public.qc_portal_access (
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  views text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id),
  CONSTRAINT qc_portal_access_views_qc_only CHECK (public.qc_keys_only(views)),
  CONSTRAINT qc_portal_access_capabilities_qc_only CHECK (public.qc_keys_only(capabilities))
);

CREATE INDEX IF NOT EXISTS qc_portal_access_company
  ON public.qc_portal_access (company_id);

COMMENT ON TABLE public.qc_portal_access IS
  'WAQC QC portal access: one row per person and company, qc_ keys only (qc_manage_users = QC company admin). Not a sys company grant and gives no sys access. Service role only. Owned by WAQC (qc.wolthers.com).';

ALTER TABLE public.qc_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qc_portal_access FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_portal_access TO service_role;

-- Let the REST API see the new table straight away.
NOTIFY pgrst, 'reload schema';

-- Verification: one row per check, every ok = true.
SELECT 'qc_portal_access exists' AS check_name,
       to_regclass('public.qc_portal_access') IS NOT NULL AS ok
UNION ALL
SELECT 'primary key is (user_id, company_id)',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'p'
           AND pg_get_constraintdef(k.oid) = 'PRIMARY KEY (user_id, company_id)'
       )
UNION ALL
SELECT 'user_id references user_profiles, ON DELETE CASCADE',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('public.user_profiles')
           AND k.confdeltype = 'c'
       )
UNION ALL
SELECT 'company_id references companies, ON DELETE CASCADE',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('public.companies')
           AND k.confdeltype = 'c'
       )
UNION ALL
SELECT 'created_by references auth.users, ON DELETE SET NULL',
       EXISTS (
         SELECT 1 FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'f'
           AND k.confrelid = to_regclass('auth.users')
           AND k.confdeltype = 'n'
       )
UNION ALL
SELECT 'views and capabilities are CHECKed for qc_ keys only',
       (
         SELECT count(*) FROM pg_constraint k
         WHERE k.conrelid = to_regclass('public.qc_portal_access')
           AND k.contype = 'c'
           AND k.conname IN ('qc_portal_access_views_qc_only', 'qc_portal_access_capabilities_qc_only')
       ) = 2
UNION ALL
SELECT 'qc_keys_only accepts qc_ keys and refuses anything else',
       public.qc_keys_only(ARRAY['qc_samples', 'qc_manage_users'])
       AND public.qc_keys_only(ARRAY[]::text[])
       AND NOT public.qc_keys_only(ARRAY['qc_samples', 'contracts'])
       AND NOT public.qc_keys_only(ARRAY['manage_users'])
       AND NOT public.qc_keys_only(ARRAY['qc_samples', NULL])
UNION ALL
SELECT 'index on company_id',
       EXISTS (
         SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'qc_portal_access' AND indexname = 'qc_portal_access_company'
       )
UNION ALL
SELECT 'RLS on',
       coalesce((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.qc_portal_access')), false)
UNION ALL
SELECT 'no policies',
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'qc_portal_access')
UNION ALL
SELECT 'anon has no rights',
       NOT has_table_privilege('anon', 'public.qc_portal_access', 'SELECT,INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'authenticated has no rights',
       NOT has_table_privilege('authenticated', 'public.qc_portal_access', 'SELECT,INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'service_role reads and writes',
       has_table_privilege('service_role', 'public.qc_portal_access', 'SELECT')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'INSERT')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'UPDATE')
       AND has_table_privilege('service_role', 'public.qc_portal_access', 'DELETE');
