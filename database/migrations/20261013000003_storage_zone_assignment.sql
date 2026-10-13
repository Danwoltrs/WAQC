-- Storage zones assigned by hand (spec docs/superpowers/specs/2026-10-13-storage-zone-assignment-design.md).
-- Anyone who works in a lab may set which client a cubby is for; every change
-- is logged. The caller rule is the view rule of storage_lab_occupancy
-- (20261013000000): global admins, global_* roles, or internal staff of that lab.

BEGIN;

CREATE TABLE IF NOT EXISTS public.storage_zone_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id uuid NOT NULL REFERENCES public.laboratories(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.storage_positions(id) ON DELETE SET NULL,
  position_code text NOT NULL,
  from_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_zone_history_lab_at ON public.storage_zone_history (laboratory_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS storage_zone_history_position ON public.storage_zone_history (position_id);

ALTER TABLE public.storage_zone_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_zone_history_staff_select ON public.storage_zone_history;
CREATE POLICY storage_zone_history_staff_select ON public.storage_zone_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.is_global_admin = true
         OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
             AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = storage_zone_history.laboratory_id)))));
REVOKE INSERT, UPDATE, DELETE ON public.storage_zone_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_storage_zones(p_lab uuid, p_changes jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_change jsonb;
  v_code text;
  v_company uuid;
  v_position uuid;
  v_current uuid;
  v_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
               AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = p_lab)))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_changes) > 5000 THEN
    RAISE EXCEPTION 'invalid_zone_changes' USING ERRCODE = '22023';
  END IF;

  -- One save at a time per lab, the same lock save_lab_floor_plan takes.
  PERFORM 1 FROM laboratories WHERE id = p_lab FOR UPDATE;

  FOR v_change IN SELECT e FROM jsonb_array_elements(p_changes) e LOOP
    v_code := v_change->>'code';
    IF v_code IS NULL OR length(v_code) = 0
       OR COALESCE(jsonb_typeof(v_change->'company_id'), 'missing') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'invalid_zone_changes' USING ERRCODE = '22023';
    END IF;
    v_company := (v_change->>'company_id')::uuid;

    v_position := (SELECT sp.id FROM storage_positions sp
                   WHERE sp.laboratory_id = p_lab AND sp.position_code = v_code LIMIT 1);
    IF v_position IS NULL THEN
      RAISE EXCEPTION 'unknown_cubby' USING ERRCODE = 'P0001', DETAIL = v_code;
    END IF;
    IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = v_company) THEN
      RAISE EXCEPTION 'unknown_company' USING ERRCODE = 'P0001';
    END IF;

    v_current := (SELECT sp.company_id FROM storage_positions sp WHERE sp.id = v_position);
    IF v_current IS DISTINCT FROM v_company THEN
      UPDATE storage_positions SET company_id = v_company WHERE id = v_position;
      INSERT INTO storage_zone_history (laboratory_id, position_id, position_code, from_company_id, to_company_id, changed_by)
      VALUES (p_lab, v_position, v_code, v_current, v_company, auth.uid());
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_storage_zones(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_storage_zones(uuid, jsonb) TO authenticated;

-- One row per save and client change (a save is one transaction, so its rows share changed_at).
CREATE OR REPLACE FUNCTION public.storage_zone_history_events(p_lab uuid, p_shelf uuid DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (changed_at timestamptz, changed_by_name text, from_name text, to_name text, codes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT h.changed_at,
         COALESCE(NULLIF(trim(pr.full_name), ''), pr.email, 'Unknown') AS changed_by_name,
         COALESCE(NULLIF(trim(fc.fantasy_name), ''), fc.name) AS from_name,
         COALESCE(NULLIF(trim(tc.fantasy_name), ''), tc.name) AS to_name,
         array_agg(h.position_code ORDER BY h.position_code) AS codes
  FROM storage_zone_history h
  LEFT JOIN profiles pr ON pr.id = h.changed_by
  LEFT JOIN companies fc ON fc.id = h.from_company_id
  LEFT JOIN companies tc ON tc.id = h.to_company_id
  WHERE h.laboratory_id = p_lab
    AND (p_shelf IS NULL OR h.position_id IN (SELECT sp.id FROM storage_positions sp WHERE sp.shelf_id = p_shelf))
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR (COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')
               AND (p.qc_role::text LIKE 'global\_%' OR p.laboratory_id = p_lab))))
  GROUP BY h.changed_at, h.changed_by, pr.full_name, pr.email,
           h.from_company_id, fc.fantasy_name, fc.name, h.to_company_id, tc.fantasy_name, tc.name
  ORDER BY h.changed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
$$;

REVOKE EXECUTE ON FUNCTION public.storage_zone_history_events(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_zone_history_events(uuid, uuid, integer) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'column' AS kind, column_name AS name, data_type AS detail
FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'storage_zone_history'
UNION ALL
SELECT 'function', p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('save_storage_zones', 'storage_zone_history_events')
UNION ALL
SELECT 'policy', policyname, permissive || ' ' || cmd
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'storage_zone_history';
