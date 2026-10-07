-- save_lab_floor_plan scenarios. Runs in a transaction and rolls back: nothing
-- is kept. An error names the scenario that failed; "Success. No rows returned"
-- means every scenario passed. Needs both 20261007 migrations applied.
BEGIN;

SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM public.profiles WHERE is_global_admin = true ORDER BY created_at LIMIT 1),
  'role', 'authenticated')::text, true);

INSERT INTO public.laboratories (id, name, code)
VALUES ('00000000-0000-4000-8000-0000000a0001', 'Storage scenario lab', 'ZZ-STORAGE-TEST');

DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000a0001';
  v_a uuid;
  v_b uuid;
  v_cubby uuid;
  v_ok boolean;
BEGIN
  -- 1. Two new shelves create their cubbies and the lab capacity.
  PERFORM public.save_lab_floor_plan(v_lab,
    '{"version":1,"rooms":[{"id":"r1","x":0,"y":0,"w":800,"d":600}],"items":[]}'::jsonb,
    '[{"shelf_letter":"A","rows":2,"columns":3,"samples_per_position":42,"x_cm":50,"y_cm":50,"width_cm":120,"depth_cm":40,"rot":0,"access_side":"front"},
      {"shelf_letter":"B","rows":1,"columns":2,"samples_per_position":10,"x_cm":300,"y_cm":50,"width_cm":60,"depth_cm":40,"rot":90,"access_side":"both"}]'::jsonb);
  IF (SELECT count(*) FROM public.storage_positions WHERE laboratory_id = v_lab) <> 8 THEN
    RAISE EXCEPTION 'scenario 1: expected 8 cubbies';
  END IF;
  IF (SELECT storage_capacity FROM public.laboratories WHERE id = v_lab) <> 2 * 3 * 42 + 1 * 2 * 10 THEN
    RAISE EXCEPTION 'scenario 1: storage_capacity wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.storage_positions WHERE laboratory_id = v_lab AND position_code = 'A-B3') THEN
    RAISE EXCEPTION 'scenario 1: cubby A-B3 missing';
  END IF;

  v_a := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab AND shelf_letter = 'A');
  v_b := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab AND shelf_letter = 'B');
  v_cubby := (SELECT id FROM public.storage_positions WHERE shelf_id = v_a AND row_number = 1 AND column_number = 1);

  -- 2. Swap letters A <-> B and shrink the old A to 1 x 2: codes follow, kept cubbies keep their id.
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id', v_a, 'shelf_letter', 'B', 'rows', 1, 'columns', 2, 'samples_per_position', 42,
        'x_cm', 50, 'y_cm', 50, 'width_cm', 120, 'depth_cm', 40, 'rot', 0, 'access_side', 'front'),
      jsonb_build_object('id', v_b, 'shelf_letter', 'A', 'rows', 1, 'columns', 2, 'samples_per_position', 10,
        'x_cm', 300, 'y_cm', 50, 'width_cm', 60, 'depth_cm', 40, 'rot', 90, 'access_side', 'both')));
  IF (SELECT shelf_letter FROM public.lab_shelves WHERE id = v_a) <> 'B' THEN
    RAISE EXCEPTION 'scenario 2: letter did not move';
  END IF;
  IF (SELECT count(*) FROM public.storage_positions WHERE shelf_id = v_a) <> 2 THEN
    RAISE EXCEPTION 'scenario 2: shrunk shelf should keep 2 cubbies';
  END IF;
  IF (SELECT position_code FROM public.storage_positions WHERE id = v_cubby) IS DISTINCT FROM 'B-A1' THEN
    RAISE EXCEPTION 'scenario 2: kept cubby lost its id or code';
  END IF;

  -- 3. Leaving a shelf out deletes it and its cubbies.
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', v_a, 'shelf_letter', 'B', 'rows', 1, 'columns', 2,
      'samples_per_position', 42, 'x_cm', 50, 'y_cm', 50, 'width_cm', 120, 'depth_cm', 40, 'rot', 0, 'access_side', 'front')));
  IF EXISTS (SELECT 1 FROM public.lab_shelves WHERE id = v_b)
     OR (SELECT count(*) FROM public.storage_positions WHERE laboratory_id = v_lab) <> 2 THEN
    RAISE EXCEPTION 'scenario 3: removed shelf still present';
  END IF;

  -- 4. Duplicate letters are refused as a conflict.
  v_ok := false;
  BEGIN
    PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
      '[{"shelf_letter":"C","rows":1,"columns":1,"samples_per_position":1,"x_cm":0,"y_cm":0,"width_cm":20,"depth_cm":20,"rot":0,"access_side":"front"},
        {"shelf_letter":"C","rows":1,"columns":1,"samples_per_position":1,"x_cm":0,"y_cm":0,"width_cm":20,"depth_cm":20,"rot":0,"access_side":"front"}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'storage_conflict';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 4: duplicate letter not refused as storage_conflict'; END IF;

  -- 5. A shelf id from nowhere is unknown_shelf.
  v_ok := false;
  BEGIN
    PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
      '[{"id":"00000000-0000-4000-8000-0000000a0099","shelf_letter":"D","rows":1,"columns":1,"samples_per_position":1,"x_cm":0,"y_cm":0,"width_cm":20,"depth_cm":20,"rot":0,"access_side":"front"}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'unknown_shelf';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 5: unknown shelf not refused'; END IF;

  -- 7. A shelf turned 90 degrees stands flush against the wall at x = 0:
  --    120 x 40 covers 40 x 120 about its centre, so its stored corner is x = -40.
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    jsonb_build_array(jsonb_build_object('id', v_a, 'shelf_letter', 'B', 'rows', 1, 'columns', 2,
      'samples_per_position', 42, 'x_cm', -40, 'y_cm', 50, 'width_cm', 120, 'depth_cm', 40, 'rot', 90, 'access_side', 'front')));
  IF (SELECT x_cm FROM public.lab_shelves WHERE id = v_a) <> -40 THEN
    RAISE EXCEPTION 'scenario 7: shelf against the wall not saved';
  END IF;
  v_ok := false;
  BEGIN
    PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
      jsonb_build_array(jsonb_build_object('id', v_a, 'shelf_letter', 'B', 'rows', 1, 'columns', 2,
        'samples_per_position', 42, 'x_cm', -50, 'y_cm', 50, 'width_cm', 120, 'depth_cm', 40, 'rot', 90, 'access_side', 'front')));
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 7: a shelf through the wall was accepted'; END IF;
END $$;

-- The deferred letter constraint is otherwise only checked at COMMIT, which
-- this script never reaches: check it now, after the swap in scenario 2.
SET CONSTRAINTS ALL IMMEDIATE;

-- 8-11 put two samples in a cubby. Triggers are switched off for the rest of
-- this transaction first, so moving them here can never reach the sys mirror;
-- everything is rolled back at the end anyway.
DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000a0001';
  v_a uuid;
  v_cubby uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_shelf jsonb;
  v_ok boolean;
BEGIN
  BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'scenarios 1-7 passed; 8-11 not run: this role cannot switch triggers off (session_replication_role)';
  END;

  v_a := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab);
  v_cubby := (SELECT id FROM public.storage_positions WHERE shelf_id = v_a AND row_number = 1 AND column_number = 2);
  v_s1 := (SELECT id FROM public.samples WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1);
  v_s2 := (SELECT id FROM public.samples WHERE deleted_at IS NULL ORDER BY created_at OFFSET 1 LIMIT 1);
  IF v_cubby IS NULL OR v_s2 IS NULL THEN RAISE EXCEPTION 'scenario 8: setup failed'; END IF;
  -- s2 is a contract sibling of s1: one physical tin.
  UPDATE public.samples SET laboratory_id = v_lab, storage_position_id = v_cubby, storage_position = 'B-A2',
                            lab_source_sample_id = NULL
  WHERE id = v_s1;
  UPDATE public.samples SET laboratory_id = v_lab, storage_position_id = v_cubby, storage_position = 'B-A2',
                            lab_source_sample_id = v_s1
  WHERE id = v_s2;
  v_shelf := (SELECT jsonb_build_object('id', id, 'shelf_letter', shelf_letter, 'rows', rows, 'columns', columns,
                'samples_per_position', samples_per_position, 'x_cm', x_cm, 'y_cm', y_cm, 'width_cm', width_cm,
                'depth_cm', depth_cm, 'rot', rot, 'access_side', access_side)
              FROM public.lab_shelves WHERE id = v_a);

  -- 8. Contract siblings share one tin: the cubby holds 1 physical sample.
  IF (SELECT occupied FROM public.storage_lab_occupancy(v_lab) WHERE position_id = v_cubby) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'scenario 8: siblings not counted once';
  END IF;

  -- 9. A shelf that still holds samples cannot be left out.
  v_ok := false;
  BEGIN
    PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb, '[]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'storage_conflict';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 9: dropping an occupied shelf was not refused'; END IF;

  -- 10. Nor can its grid shrink past an occupied cubby (B-A2 is column 2).
  v_ok := false;
  BEGIN
    PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
      jsonb_build_array(v_shelf || '{"columns":1}'::jsonb));
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'storage_conflict';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 10: shrinking past an occupied cubby was not refused'; END IF;

  -- 11. Renaming the shelf renames the code on the samples it holds.
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    jsonb_build_array(v_shelf || '{"shelf_letter":"C"}'::jsonb));
  IF (SELECT storage_position FROM public.samples WHERE id = v_s1) IS DISTINCT FROM 'C-A2'
     OR (SELECT storage_position_id FROM public.samples WHERE id = v_s2) IS DISTINCT FROM v_cubby THEN
    RAISE EXCEPTION 'scenario 11: samples did not follow the renamed cubby';
  END IF;
END $$;

-- 6. A lab user without a management role is refused (last: it changes the user).
DO $$
DECLARE
  v_user uuid;
  v_ok boolean := false;
BEGIN
  v_user := (SELECT id FROM public.profiles
             WHERE qc_role::text = 'lab_personnel' AND COALESCE(is_global_admin, false) = false LIMIT 1);
  IF v_user IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.save_lab_floor_plan('00000000-0000-4000-8000-0000000a0001',
      '{"version":1,"rooms":[],"items":[]}'::jsonb, '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 6: lab_personnel could save a plan'; END IF;
END $$;

ROLLBACK;