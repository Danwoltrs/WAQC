-- Client portal accounts, foundation (spec 2026-10-14-client-portal-accounts-design.md).
--
-- 1. waqc_access_kind(): how WAQC treats the caller. Same rule as
--    classifyAccessKind() in src/lib/auth/access-kind.ts; keep them equal.
--      external: user_profiles.user_type = 'external', any status (always wins)
--      staff:    a profiles row with a role other than client/supplier/buyer
--      none:     everyone else
-- 2. waqc_is_staff(): the staff test for row-level policies (the older
--    is_waqc_staff never reached the live database).
-- 3. portal_invitations: pending QC portal invitations. Only the SHA-256
--    of each token is stored. Service role only: RLS on, no policies.
--
-- Run database/checks/20261014000001_precheck.sql first and read its result.
--
-- Paste-safe for the Supabase editor.

CREATE OR REPLACE FUNCTION public.waqc_access_kind()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.user_type = 'external'
    ) THEN 'external'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.qc_role IS NOT NULL
        AND p.qc_role::text NOT IN ('client', 'supplier', 'buyer')
    ) THEN 'staff'
    ELSE 'none'
  END
$$;

-- Executable by anon too (PUBLIC default); with no auth.uid(), anon always gets 'none' / false.
GRANT EXECUTE ON FUNCTION public.waqc_access_kind() TO authenticated;

CREATE OR REPLACE FUNCTION public.waqc_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.waqc_access_kind() = 'staff'
$$;

GRANT EXECUTE ON FUNCTION public.waqc_is_staff() TO authenticated;

CREATE TABLE IF NOT EXISTS public.portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  views text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  is_company_admin boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_kind text NOT NULL CHECK (invited_by_kind IN ('staff', 'manager')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_company_admin OR invited_by_kind = 'staff')
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_invitations_one_pending
  ON public.portal_invitations (company_id, email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS portal_invitations_company
  ON public.portal_invitations (company_id, created_at DESC);

ALTER TABLE public.portal_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portal_invitations FROM anon, authenticated;

-- Verification: one row per check, every ok = true.
SELECT 'waqc_access_kind exists in public' AS check_name,
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'waqc_access_kind'
       ) AS ok
UNION ALL
SELECT 'waqc_access_kind is SECURITY DEFINER with search_path pinned',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'waqc_access_kind'
           AND p.prosecdef AND 'search_path=public' = ANY (p.proconfig)
       )
UNION ALL
SELECT 'waqc_is_staff exists in public',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'waqc_is_staff'
       )
UNION ALL
SELECT 'waqc_is_staff is SECURITY DEFINER with search_path pinned',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'waqc_is_staff'
           AND p.prosecdef AND 'search_path=public' = ANY (p.proconfig)
       )
UNION ALL
SELECT 'portal_invitations has RLS on',
       coalesce((
         SELECT c.relrowsecurity FROM pg_class c
         WHERE c.oid = 'public.portal_invitations'::regclass
       ), false)
UNION ALL
SELECT 'portal_invitations has no policies',
       NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'portal_invitations'
       )
UNION ALL
SELECT 'portal_invitations has a token_hash column',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'portal_invitations'
           AND column_name = 'token_hash'
       );
