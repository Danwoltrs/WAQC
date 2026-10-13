-- save_storage_zones and storage_zone_history_events scenarios. Runs in a
-- transaction and rolls back: nothing is kept. An error names the scenario that
-- failed; the set_config row (or "no rows") means every scenario passed.
-- Needs 20261007000001/2, 20261013000000/1 and 20261013000003 applied.
BEGIN;

SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM public.profiles WHERE is_global_admin = true ORDER BY created_at LIMIT 1),
  'role', 'authenticated')::text, true);

INSERT INTO public.laboratories (id, name, code)
VALUES ('00000000-0000-4000-8000-0000000b0001', 'Zone scenario lab', 'ZZ-ZONE-TEST');

DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000b0001';
  v_shelf uuid;
  v_co uuid;
  v_n integer;
  v_ok boolean;
BEGIN
  PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb,
    '[{"shelf_letter":"A","rows":2,"columns":2,"samples_per_position":10,"x_cm":0,"y_cm":0,"width_cm":100,"depth_cm":40,"rot":0,"access_side":"front"}]'::jsonb);
  v_shelf := (SELECT id FROM public.lab_shelves WHERE laboratory_id = v_lab);
  v_co := (SELECT id FROM public.companies ORDER BY created_at LIMIT 1);
  IF v_shelf IS NULL OR v_co IS NULL THEN RAISE EXCEPTION 'setup failed'; END IF;

  -- 1. Two cubbies to a client: both written, both logged.
  v_n := public.save_storage_zones(v_lab, jsonb_build_array(
    jsonb_build_object('code', 'A-A1', 'company_id', v_co),
    jsonb_build_object('code', 'A-A2', 'company_id', v_co)));
  IF v_n <> 2 THEN RAISE EXCEPTION 'scenario 1: expected 2 changes, got %', v_n; END IF;
  IF (SELECT count(*) FROM public.storage_positions WHERE laboratory_id = v_lab AND company_id = v_co) <> 2 THEN
    RAISE EXCEPTION 'scenario 1: zones not written';
  END IF;
  IF (SELECT count(*) FROM public.storage_zone_history WHERE laboratory_id = v_lab) <> 2 THEN
    RAISE EXCEPTION 'scenario 1: changes not logged';
  END IF;

  -- 2. The same again changes and logs nothing.
  v_n := public.save_storage_zones(v_lab, jsonb_build_array(jsonb_build_object('code', 'A-A1', 'company_id', v_co)));
  IF v_n <> 0 OR (SELECT count(*) FROM public.storage_zone_history WHERE laboratory_id = v_lab) <> 2 THEN
    RAISE EXCEPTION 'scenario 2: an unchanged cubby was logged';
  END IF;

  -- 3. Back to general space, logged from the client.
  v_n := public.save_storage_zones(v_lab, '[{"code":"A-A2","company_id":null}]'::jsonb);
  IF v_n <> 1 OR NOT EXISTS (SELECT 1 FROM public.storage_zone_history WHERE laboratory_id = v_lab
      AND position_code = 'A-A2' AND from_company_id = v_co AND to_company_id IS NULL) THEN
    RAISE EXCEPTION 'scenario 3: return to general not logged';
  END IF;

  -- 4. A cubby the lab does not have.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[{"code":"Q-A1","company_id":null}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'unknown_cubby';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 4: unknown cubby not refused'; END IF;

  -- 5. A client that does not exist.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[{"code":"A-A1","company_id":"00000000-0000-4000-8000-0000000b0099"}]'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'unknown_company';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 5: unknown company not refused'; END IF;

  -- 6. A body that is not a list.
  v_ok := false;
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '{"code":"A-A1"}'::jsonb);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM = 'invalid_zone_changes';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 6: a non-list was accepted'; END IF;

  -- 7. History: one event per save and client change, codes sorted, also per shelf.
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, NULL, 20)) <> 2 THEN
    RAISE EXCEPTION 'scenario 7: expected 2 events';
  END IF;
  IF (SELECT codes FROM public.storage_zone_history_events(v_lab, NULL, 20) WHERE to_name IS NOT NULL)
     IS DISTINCT FROM ARRAY['A-A1', 'A-A2'] THEN
    RAISE EXCEPTION 'scenario 7: codes not grouped into one event';
  END IF;
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, v_shelf, 20)) <> 2 THEN
    RAISE EXCEPTION 'scenario 7: the shelf filter lost events';
  END IF;
END $$;

-- 8. A user of another lab can neither assign nor read (last: it changes the user).
DO $$
DECLARE
  v_lab uuid := '00000000-0000-4000-8000-0000000b0001';
  v_user uuid;
  v_ok boolean := false;
BEGIN
  v_user := (SELECT id FROM public.profiles
             WHERE qc_role::text = 'lab_personnel' AND COALESCE(is_global_admin, false) = false
               AND laboratory_id IS DISTINCT FROM v_lab LIMIT 1);
  IF v_user IS NULL THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.save_storage_zones(v_lab, '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'scenario 8: a user of another lab could assign zones'; END IF;
  IF (SELECT count(*) FROM public.storage_zone_history_events(v_lab, NULL, 20)) <> 0 THEN
    RAISE EXCEPTION 'scenario 8: a user of another lab could read the history';
  END IF;
END $$;

ROLLBACK;
