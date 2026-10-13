-- Laboratories INSERT / UPDATE no longer depend on profiles.qc_enabled.
--
-- The 001 policies call can_create_laboratories(auth.uid()), which reads
-- profiles WHERE qc_enabled = true. For a global admin with qc_enabled = false
-- (daniel@wolthers.com, checked live 2026-10-13) it returns NULL, so creating a
-- lab failed with 42501 even though POST /api/laboratories had let the request
-- through. Same family as 20260610000000 (samples) and 20260615000000
-- (client_qualities): read profiles directly, matching the API gate
-- (is_global_admin, or qc_role global_admin / global_quality_admin).
--
-- Only these two named PERMISSIVE policies are replaced; sys's RESTRICTIVE
-- *_deny policies on shared tables are left alone.

BEGIN;

DROP POLICY IF EXISTS "Global admins can create laboratories" ON public.laboratories;
DROP POLICY IF EXISTS "Global admins can update laboratories" ON public.laboratories;

CREATE POLICY "Global admins can create laboratories" ON public.laboratories
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (p.is_global_admin = true
             OR COALESCE(p.qc_role::text, '') IN ('global_admin', 'global_quality_admin'))
    )
  );

CREATE POLICY "Global admins can update laboratories" ON public.laboratories
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (p.is_global_admin = true
             OR COALESCE(p.qc_role::text, '') IN ('global_admin', 'global_quality_admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (p.is_global_admin = true
             OR COALESCE(p.qc_role::text, '') IN ('global_admin', 'global_quality_admin'))
    )
  );

COMMIT;

-- Check: every policy now on laboratories.
SELECT policyname, permissive, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'laboratories'
ORDER BY cmd, policyname;
