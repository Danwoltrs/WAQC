-- Migration 20260622000003: restrict sample SELECT for client-role users (Partner Portal)
--
-- THREAT (verified via pg_policies on 2026-06-23): the live `samples` table has PERMISSIVE
-- SELECT policies that are effectively "any authenticated user can read every sample" —
-- notably:
--   * "Authenticated users can read samples"  (USING true)
--   * "Lab personnel can read samples"        (USING auth.uid() IS NOT NULL)
-- Because PERMISSIVE policies OR together, a client-role portal user could read EVERY
-- company's samples directly through their session (IDOR). The Partner Portal onboards
-- client-role users, so this must be closed.
--
-- FIX (surgical, ZERO staff/supplier/buyer regression): add ONE RESTRICTIVE policy.
-- RESTRICTIVE policies AND with the permissive set, so this can only ever *remove* access,
-- and it only constrains client-role users:
--   * Non-client users (staff of any role, supplier, buyer, role-less) are never constrained
--     by it — the "NOT EXISTS (a client profile)" branch passes — so their current read
--     access is UNCHANGED. We deliberately do NOT drop the permissive policies, which would
--     risk regressing those read paths.
--   * Client-role users may only see NON-DELETED rows for their own company
--     (samples.client_id OR samples.end_client_id = their profiles.client_id). A client with
--     a NULL client_id sees nothing (fail-closed).
--
-- The pre-existing RESTRICTIVE "samples_cobroker_deny" policy ANDs alongside this one (both
-- must pass) — unaffected. The public certificate path uses the service role, which bypasses
-- RLS entirely, so it is unaffected. This RLS change is defense-in-depth: every /api/portal/*
-- route already scopes by company at the application layer.

DROP POLICY IF EXISTS "samples_client_select_own_company" ON public.samples;

CREATE POLICY "samples_client_select_own_company"
ON public.samples
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  -- Non-client users are not constrained by this restriction.
  NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.qc_role = 'client'
  )
  OR
  -- Client-role users: only their own company's non-deleted samples.
  (
    samples.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.qc_role = 'client'
        AND p.client_id IS NOT NULL
        AND (samples.client_id = p.client_id OR samples.end_client_id = p.client_id)
    )
  )
);
