-- Profile guard: a global admin counts only while their own profile has
-- qc_enabled IS TRUE.
--
-- RUN database/checks/20261014000008_precheck.sql FIRST. If the live body
-- differs from 20261014000000_guard_profile_privilege_columns.sql (applied
-- 2026-10-14), stop and tell the controller before pasting this.
--
-- Why: the guard from 20261014000000 lets any caller whose profile says
-- is_global_admin, or whose qc_role is global_admin / global_quality_admin,
-- change every privilege column, its own row included. qc_enabled is now part
-- of the staff test (waqc_access_kind), so a stale global-role row with
-- qc_enabled not true could switch its own qc_enabled on and become staff.
-- Such a caller is now treated like everyone else: it can no longer change
-- its own role, lab or access flags, nor is_global_admin or client_id on any
-- row.
--
-- Only the global-admin test changes. Everything else is the 000000 body
-- unchanged, and the trigger binding (trg_guard_profile_privileges, BEFORE
-- INSERT OR UPDATE on public.profiles) is left as it is: CREATE OR REPLACE
-- keeps it pointing at this function.
--
-- Paste-safe for the Supabase editor: variables are assigned with :=, and no
-- table is created, so the editor appends no ENABLE RLS statements.

CREATE OR REPLACE FUNCTION public.guard_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text;
  caller_is_global boolean;
  caller_enabled boolean;
BEGIN
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  caller_role := (SELECT p.qc_role::text FROM public.profiles p WHERE p.id = caller_id);
  caller_is_global := COALESCE(
    (SELECT p.is_global_admin FROM public.profiles p WHERE p.id = caller_id),
    false
  );
  -- A global role counts only on an enabled profile (qc_enabled IS TRUE).
  caller_enabled := COALESCE(
    (SELECT p.qc_enabled IS TRUE FROM public.profiles p WHERE p.id = caller_id),
    false
  );

  IF caller_enabled AND (caller_is_global OR caller_role IN ('global_admin', 'global_quality_admin')) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.qc_role IS NOT NULL
       OR NEW.laboratory_id IS NOT NULL
       OR NEW.client_id IS NOT NULL
       OR COALESCE(NEW.is_global_admin, false)
       OR COALESCE(NEW.qc_enabled, false)
       OR COALESCE(NEW.is_master_cupper, false)
       OR COALESCE(NEW.is_cupper, false)
       OR COALESCE(NEW.is_q_grader, false) THEN
      RAISE EXCEPTION 'Only an administrator can set a role, laboratory, company or access flag on a profile'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_global_admin IS DISTINCT FROM OLD.is_global_admin
     OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Only a global admin can change global admin status or the company on a profile'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.id = caller_id AND (
       NEW.qc_role IS DISTINCT FROM OLD.qc_role
    OR NEW.laboratory_id IS DISTINCT FROM OLD.laboratory_id
    OR NEW.qc_enabled IS DISTINCT FROM OLD.qc_enabled
    OR NEW.is_master_cupper IS DISTINCT FROM OLD.is_master_cupper
    OR NEW.is_cupper IS DISTINCT FROM OLD.is_cupper
    OR NEW.is_q_grader IS DISTINCT FROM OLD.is_q_grader
  ) THEN
    RAISE EXCEPTION 'You cannot change your own role, laboratory or access flags'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Verification: one row per check, every ok = true.
SELECT 'guard requires qc_enabled for the global-admin exemption' AS check,
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'guard_profile_privilege_columns'
           AND position('IF caller_enabled AND (caller_is_global OR caller_role IN' in pg_get_functiondef(p.oid)) > 0
           AND position('p.qc_enabled IS TRUE' in pg_get_functiondef(p.oid)) > 0
       ) AS ok
UNION ALL
SELECT 'guard is SECURITY DEFINER with search_path pinned',
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'guard_profile_privilege_columns'
           AND p.prosecdef AND 'search_path=public' = ANY (p.proconfig)
       )
UNION ALL
SELECT 'trg_guard_profile_privileges still bound to public.profiles and enabled',
       EXISTS (
         SELECT 1 FROM pg_trigger t
         JOIN pg_proc p ON p.oid = t.tgfoid
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE t.tgrelid = 'public.profiles'::regclass
           AND t.tgname = 'trg_guard_profile_privileges'
           AND n.nspname = 'public' AND p.proname = 'guard_profile_privilege_columns'
           AND NOT t.tgisinternal
           AND t.tgenabled <> 'D'
       );
