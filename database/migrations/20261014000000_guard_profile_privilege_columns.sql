-- Stop users granting themselves privileges on public.profiles.
--
-- Live state on 2026-10-14: the authenticated role holds UPDATE on every
-- profiles column, and both UPDATE policies ("profiles_update_policy" and
-- "Users can update profiles based on role") pass on auth.uid() = id with no
-- column limit. trg_sync_is_global_admin then switches is_global_admin on as
-- soon as qc_role says global_admin. So any signed-in user could make
-- themselves a global admin from the browser. The INSERT policy
-- (auth.uid() = id) has the same gap for a user who has no profile yet.
--
-- The guard leaves the policies alone and checks the privilege columns:
--   * no user (service role, SQL editor, the sign-up trigger): allowed
--   * global admins (is_global_admin, global_admin, global_quality_admin): allowed
--   * everyone else:
--       - never changes is_global_admin or client_id
--       - never changes role, lab or access flags on their OWN row
--       - on other rows, RLS (can_update_profile) already limits a lab quality
--         manager to lab_personnel / lab_finance_manager in their own lab
--       - a row they create themselves carries no role, lab, company or flag
--
-- The trigger name sorts before trg_sync_is_global_admin, and BEFORE triggers
-- fire in name order, so the guard sees the values the caller sent.
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
BEGIN
  IF caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  caller_role := (SELECT p.qc_role::text FROM public.profiles p WHERE p.id = caller_id);
  caller_is_global := COALESCE(
    (SELECT p.is_global_admin FROM public.profiles p WHERE p.id = caller_id),
    false
  );

  IF caller_is_global OR caller_role IN ('global_admin', 'global_quality_admin') THEN
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

DROP TRIGGER IF EXISTS trg_guard_profile_privileges ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privilege_columns();

-- Verification: the guard should be listed before trg_sync_is_global_admin.
SELECT tgname AS trigger_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal
ORDER BY tgname;
