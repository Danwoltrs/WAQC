-- storage_lab_occupancy is SECURITY DEFINER, so it reads samples past RLS. It
-- let any internal user count any lab's cubbies; it now applies the view rule
-- the API applies (canViewLabStorage in src/lib/storage/storage-access.ts):
-- global admins, global_* roles, or internal staff of that lab. Editors calling
-- it from save_lab_floor_plan all pass this rule.

BEGIN;

CREATE OR REPLACE FUNCTION public.storage_lab_occupancy(p_lab uuid)
RETURNS TABLE (position_id uuid, occupied integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.storage_position_id, count(DISTINCT COALESCE(s.lab_source_sample_id, s.id))::integer
  FROM samples s
  WHERE s.laboratory_id = p_lab
    AND s.storage_position_id IS NOT NULL
    AND s.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
               AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = p_lab))))
  GROUP BY s.storage_position_id
$$;

REVOKE EXECUTE ON FUNCTION public.storage_lab_occupancy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_lab_occupancy(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
