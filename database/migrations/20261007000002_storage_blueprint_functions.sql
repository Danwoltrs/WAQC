-- Lab storage blueprint, Part 1: functions.
-- storage_lab_occupancy: physical samples per cubby (a contract sibling shares
-- its lab unit's tin and is counted once). save_lab_floor_plan: applies the
-- whole plan (room document + every shelf + cubby regeneration) in one
-- transaction, or refuses with every conflict listed.

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
      AND (p.is_global_admin = true OR COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')))
  GROUP BY s.storage_position_id
$$;

CREATE OR REPLACE FUNCTION public.save_lab_floor_plan(p_lab uuid, p_plan jsonb, p_shelves jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_shelf jsonb;
  v_id uuid;
  v_letter text;
  v_rows integer;
  v_cols integer;
  v_cap integer;
  v_next_number integer;
  v_conflicts text[] := ARRAY[]::text[];
  v_payload_ids uuid[];
BEGIN
  -- Who: global admins, global quality admins, this lab's quality manager.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (p.is_global_admin = true
           OR p.qc_role::text IN ('global_admin', 'global_quality_admin')
           OR (p.qc_role::text = 'lab_quality_manager' AND p.laboratory_id = p_lab))
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_shelves) IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  -- One save at a time per lab.
  PERFORM 1 FROM laboratories WHERE id = p_lab FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_lab' USING ERRCODE = '22023';
  END IF;

  v_payload_ids := ARRAY(
    SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_shelves) e WHERE e->>'id' IS NOT NULL);

  -- A shelf id this lab does not have: the plan changed elsewhere.
  IF EXISTS (
    SELECT 1 FROM unnest(v_payload_ids) pid
    WHERE NOT EXISTS (SELECT 1 FROM lab_shelves sh WHERE sh.id = pid AND sh.laboratory_id = p_lab)
  ) THEN
    RAISE EXCEPTION 'unknown_shelf' USING ERRCODE = '22023';
  END IF;

  -- Duplicate letters.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Shelf letter ' || l || ' is used twice'
    FROM (SELECT upper(trim(e->>'shelf_letter')) AS l FROM jsonb_array_elements(p_shelves) e) x
    GROUP BY l HAVING count(*) > 1);

  -- Shelves dropped from the plan that still hold samples.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Shelf ' || sh.shelf_letter || ' still holds samples in '
           || string_agg(sp.position_code, ', ' ORDER BY sp.row_number, sp.column_number)
    FROM lab_shelves sh
    JOIN storage_positions sp ON sp.shelf_id = sh.id
    JOIN storage_lab_occupancy(p_lab) o ON o.position_id = sp.id AND o.occupied > 0
    WHERE sh.laboratory_id = p_lab AND NOT (sh.id = ANY (v_payload_ids))
    GROUP BY sh.shelf_letter);

  -- Kept shelves whose new grid or capacity would drop samples.
  v_conflicts := v_conflicts || ARRAY(
    SELECT 'Cubby ' || sp.position_code || ' holds ' || o.occupied || ' samples'
           || CASE WHEN sp.row_number > (e->>'rows')::int OR sp.column_number > (e->>'columns')::int
                   THEN ' and is outside the new grid'
                   ELSE ', more than the new capacity of ' || (e->>'samples_per_position') END
    FROM jsonb_array_elements(p_shelves) e
    JOIN storage_positions sp ON sp.shelf_id = (e->>'id')::uuid
    JOIN storage_lab_occupancy(p_lab) o ON o.position_id = sp.id AND o.occupied > 0
    WHERE e->>'id' IS NOT NULL
      AND (sp.row_number > (e->>'rows')::int
           OR sp.column_number > (e->>'columns')::int
           OR o.occupied > (e->>'samples_per_position')::int));

  IF array_length(v_conflicts, 1) > 0 THEN
    RAISE EXCEPTION 'storage_conflict' USING ERRCODE = 'P0001', DETAIL = array_to_json(v_conflicts)::text;
  END IF;

  UPDATE laboratories SET floor_plan = p_plan WHERE id = p_lab;

  DELETE FROM lab_shelves sh WHERE sh.laboratory_id = p_lab AND NOT (sh.id = ANY (v_payload_ids));

  -- Free every code first so letters can move between shelves in one save.
  UPDATE storage_positions SET position_code = id::text WHERE laboratory_id = p_lab;

  v_next_number := COALESCE((SELECT max(shelf_number) FROM lab_shelves WHERE laboratory_id = p_lab), 0);

  FOR v_shelf IN SELECT e FROM jsonb_array_elements(p_shelves) e LOOP
    v_letter := upper(trim(v_shelf->>'shelf_letter'));
    v_rows := (v_shelf->>'rows')::int;
    v_cols := (v_shelf->>'columns')::int;
    v_cap := (v_shelf->>'samples_per_position')::int;

    IF v_shelf->>'id' IS NULL THEN
      v_id := gen_random_uuid();
      v_next_number := v_next_number + 1;
      INSERT INTO lab_shelves (id, laboratory_id, shelf_number, shelf_letter, rows, columns,
                               samples_per_position, position_layout, x_cm, y_cm, width_cm,
                               depth_cm, rot, access_side)
      VALUES (v_id, p_lab, v_next_number, v_letter, v_rows, v_cols, v_cap, 'grid',
              (v_shelf->>'x_cm')::int, (v_shelf->>'y_cm')::int, (v_shelf->>'width_cm')::int,
              (v_shelf->>'depth_cm')::int, (v_shelf->>'rot')::smallint, v_shelf->>'access_side');
    ELSE
      v_id := (v_shelf->>'id')::uuid;
      UPDATE lab_shelves SET
        shelf_letter = v_letter, rows = v_rows, columns = v_cols, samples_per_position = v_cap,
        x_cm = (v_shelf->>'x_cm')::int, y_cm = (v_shelf->>'y_cm')::int,
        width_cm = (v_shelf->>'width_cm')::int, depth_cm = (v_shelf->>'depth_cm')::int,
        rot = (v_shelf->>'rot')::smallint, access_side = v_shelf->>'access_side',
        updated_at = now()
      WHERE id = v_id;
    END IF;

    -- Cubbies outside the grid are empty (checked above).
    DELETE FROM storage_positions
    WHERE shelf_id = v_id AND (row_number > v_rows OR column_number > v_cols);

    -- Kept cubbies keep their id and zone; code and capacity follow the shelf.
    UPDATE storage_positions sp
    SET position_code = generate_position_code(v_letter, sp.row_number, sp.column_number),
        capacity_per_position = v_cap,
        updated_at = now()
    WHERE sp.shelf_id = v_id;

    INSERT INTO storage_positions (laboratory_id, shelf_id, position_code, row_number, column_number, capacity_per_position)
    SELECT p_lab, v_id, generate_position_code(v_letter, r, c), r, c, v_cap
    FROM generate_series(1, v_rows) r CROSS JOIN generate_series(1, v_cols) c
    WHERE NOT EXISTS (
      SELECT 1 FROM storage_positions sp WHERE sp.shelf_id = v_id AND sp.row_number = r AND sp.column_number = c);

    -- The text code on samples follows a renamed cubby.
    UPDATE samples s SET storage_position = sp.position_code
    FROM storage_positions sp
    WHERE s.storage_position_id = sp.id AND sp.shelf_id = v_id
      AND s.storage_position IS DISTINCT FROM sp.position_code;
  END LOOP;

  UPDATE laboratories l
  SET storage_capacity = COALESCE((
    SELECT sum(sh.rows * sh.columns * sh.samples_per_position) FROM lab_shelves sh WHERE sh.laboratory_id = p_lab), 0)
  WHERE l.id = p_lab;

  RETURN jsonb_build_object('storage_capacity', (SELECT storage_capacity FROM laboratories WHERE id = p_lab));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.storage_lab_occupancy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_lab_occupancy(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_lab_floor_plan(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_lab_floor_plan(uuid, jsonb, jsonb) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
