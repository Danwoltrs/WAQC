-- 20260618000000_fix_lab_less_cupper_and_admin_flag_sync.sql
--
-- Why: Matheus could not see Edgar in the "assign cuppers" picker.
--   /api/cuppers (and the profiles RLS policy) only return cuppers whose
--   laboratory_id matches the viewer's lab. Edgar's laboratory_id was NULL,
--   so he was dropped for every lab-bound user. Separately, Edgar's
--   qc_role = 'global_admin' but is_global_admin = false: the flag is derived
--   from qc_role at profile creation, but the "edit user" path changes qc_role
--   WITHOUT re-deriving the flag, so it drifted.
--
-- This migration:
--   1. Keeps is_global_admin permanently in sync with qc_role (all write paths).
--   2. Backfills any rows where the flag had already drifted (fixes Edgar's flag).
--   3. Assigns Edgar to the Santos lab so he appears in that lab's cupper picker.
--
-- Prevention for the lab-less-cupper trap itself lives in the user-management UI
-- (a cupper can no longer be saved without a laboratory).

-- 1. Single source of truth: derive is_global_admin from qc_role on every write.
CREATE OR REPLACE FUNCTION public.sync_is_global_admin()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_global_admin := (NEW.qc_role IN ('global_admin', 'global_quality_admin'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_is_global_admin ON public.profiles;
CREATE TRIGGER trg_sync_is_global_admin
  BEFORE INSERT OR UPDATE OF qc_role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_is_global_admin();

-- 2. Backfill drift (no-op for rows already consistent; fixes Edgar -> true).
UPDATE public.profiles
SET is_global_admin = (qc_role IN ('global_admin', 'global_quality_admin'))
WHERE is_global_admin IS DISTINCT FROM (qc_role IN ('global_admin', 'global_quality_admin'));

-- 3. Give Edgar a home lab (Santos) so he shows up as a cupper there.
--    Scoped to NULL so re-running is safe and never moves an already-set lab.
UPDATE public.profiles
SET laboratory_id = '9346551b-f8c1-4fd8-b4b0-8dd1eac72ee0'  -- WOLTHERS & ASSOCIATES (Santos)
WHERE email = 'edgar@wolthers.com'
  AND laboratory_id IS NULL;
