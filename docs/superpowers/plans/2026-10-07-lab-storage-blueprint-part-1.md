# Lab Storage Blueprint — Part 1: Blueprint editor + companies link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken shelf-card floor plan with a to-scale, drawable blueprint (room, furniture, doors, windows, shelves with real size and a cubby grid), saved in one transaction, with shelf and cubby zones pointing at `companies` instead of the dropped `clients` table.

**Architecture:** The room and furniture are one JSON document in `laboratories.floor_plan`; shelves stay rows in `lab_shelves` (now with a centimetre footprint) and their cubbies rows in `storage_positions`. A SECURITY DEFINER function `save_lab_floor_plan` applies a whole plan atomically; staff read the tables directly; occupancy is counted live from `samples.storage_position_id`. The editor is plain SVG in centimetre user units with our own pointer handlers; all geometry and editor state live in pure, unit-tested modules.

**Tech Stack:** Next.js App Router (route handlers), Supabase (Postgres, PL/pgSQL, RLS), React 18 + TypeScript, Tailwind + shadcn/ui, lucide-react, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-07-lab-storage-blueprint-design.md` (sections 2, 3.1–3.5, 4, 7 Part 1, 8). Parts 2 (zones + placement) and 3 (retention + discard) get their own plans after this one ships.

**Where this plan departs from the spec (on purpose):**
- Occupancy is a function, `storage_lab_occupancy(lab)`, not a view: no view-RLS question, and the save function reuses it.
- The plan is read and saved at `GET/PUT /api/laboratories/[id]/storage` (one resource) rather than a separate `/floor-plan` path.
- `/samples/storage` embeds the workspace in the page instead of opening the overlay over it.
- The client-portal storage routes and `ClientStorageView` are deleted, not repointed: nothing calls them, and they return the SAN number. The `client_visible_shelves` view and `get_client_samples_in_storage()` go with them.

## Global Constraints

- `samples.tracking_number` (SAN-xxxxx/yy) is never rendered, returned to the browser in a storage response, or put in a file name. Samples are named by certificate number, else their own identifier (`sampleLabelText`), plus the contract number.
- Company names shown to users use the trade name: `companyDisplayName({ name, fantasy_name })` from `src/lib/contract-intake-mapping.ts`.
- All lengths are integer centimetres; origin top-left seen from above; `rot` ∈ {0, 90, 180, 270}, clockwise about the centre; `x, y` is the top-left of the unrotated rectangle.
- Limits: shapes ≥ 20 cm and ≤ 10 000 cm; positions 0..10 000; shelf rows 1..26, columns 1..99, samples per cubby 1..500; shelf letter `^[A-Z]{1,2}$`, unique per lab.
- Cubby code format stays `{shelf_letter}-{row_letter}{column}` (e.g. `B-C4`), row 1 = `A` = top row.
- SQL is pasted to Daniel in chat; Daniel applies it. Migrations use `BEGIN; … COMMIT;`, contain no `SELECT … INTO`, no `RETURNING … INTO`, no `CREATE TABLE`/`CREATE TEMP` (the Supabase editor appends `ALTER TABLE <name> ENABLE RLS` for those and aborts). Staff RLS uses the inline predicate `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.is_global_admin = true OR COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer')))`; `is_waqc_staff()` does not exist on the live DB.
- `route.ts` files export only HTTP handlers (`next build` rejects other exports); helpers live in `src/lib/storage/`.
- UI: Inter, current black/white tokens, no emojis. Containers (overlay panels, popovers) 10px radius, controls 6px, data surfaces (plan, grids, cubbies, lists) square. Zone colours from the chart palette `#556b2f #a9a454 #b07946 #445763 #efe4d4 #151618`.
- Files stay well under ~2000 lines; `src/app/laboratories/page.tsx` (1990 lines today) must shrink.
- Trunk-based: commit to the current branch (its HEAD equals `origin/main`), push to `main` only after Daniel confirms both migrations are applied (Task 10).

## Review Focus

1. **Resizing a rotated shelf** — dragging the bottom handle of a shelf turned 90° should lengthen it along its long side, not widen it. Pinned in Task 2 (`resizeRect` + `fromFootprint` on a 90° rect).
2. **Swapping two shelf letters in one save (A↔B)** — must save, not hit the unique code/letter constraints mid-transaction; kept cubbies keep their ids. Pinned in Task 1's scenario script (scenario 2).
3. **Plan changed by someone else** (a shelf id in the payload no longer exists) — must answer 409 "reload", not 500. Pinned in Task 5 (`unknown_shelf` mapping).
4. **Lab whose `floor_plan` is NULL or malformed but has legacy shelves** — must open with the shelves visible and an empty room, not crash. Pinned in Task 4 (`assembleLayout`).
5. **Closing the overlay (Escape or X) with unsaved changes** — must ask before discarding. Pinned in Task 9 (overlay test).

---

## File Structure

| File | Responsibility |
|---|---|
| `database/migrations/20261007000000_storage_blueprint_preflight.sql` | Read-only check of the live schema the migration assumes (one result set) |
| `database/migrations/20261007000001_storage_blueprint_schema.sql` | Columns, FK move to `companies`, legacy drops, backfills, staff-read RLS |
| `database/migrations/20261007000002_storage_blueprint_functions.sql` | `storage_lab_occupancy()`, `save_lab_floor_plan()` |
| `database/tests/storage_blueprint_scenarios.sql` | Rolled-back scenario script for `save_lab_floor_plan` |
| `src/lib/storage/floor-plan.ts` | Types, limits, `parseFloorPlan`, `parseShelfInputs`, `positionCode`, item labels |
| `src/lib/storage/geometry.ts` | snap, footprint/rotation, move/resize/draw, overlap, room outline, bounds |
| `src/lib/storage/storage-access.ts` | Who may view / edit a lab's storage (mirrors the SQL check) |
| `src/lib/storage/layout.ts` | Layout types, pure `assembleLayout`, DB `loadStorageLayout` |
| `src/lib/storage/save-errors.ts` | Maps `save_lab_floor_plan` errors to HTTP responses |
| `src/lib/storage/cubby-samples.ts` | Labels for samples in a cubby / search hits (no SAN), search sanitiser |
| `src/lib/storage/__fixtures__/fake-supabase.ts` | Table-aware recording Supabase fake for route tests |
| `src/app/api/laboratories/[id]/storage/route.ts` | GET layout, PUT whole plan |
| `src/app/api/laboratories/[id]/storage/cubbies/[positionId]/route.ts` | GET samples in one cubby |
| `src/app/api/laboratories/[id]/storage/search/route.ts` | GET stored samples matching a certificate / contract / ref |
| `src/components/storage/blueprint/editor-state.ts` | Pure editor reducer, shape helpers, payload conversion |
| `src/components/storage/blueprint/use-blueprint-editor.ts` | Hook around the reducer + keyboard shortcuts |
| `src/components/storage/blueprint/zone-colors.ts` | Zone colour per company |
| `src/components/storage/blueprint/shapes.tsx` | SVG renderers for shelves and furniture |
| `src/components/storage/blueprint/blueprint-canvas.tsx` | SVG surface: grid, pan/zoom, draw/move/resize, selection, scale bar |
| `src/components/storage/blueprint/shelf-front-grid.tsx` | A shelf seen from the front, one square per cubby |
| `src/components/storage/blueprint/inspector.tsx` | Right panel in Edit mode |
| `src/components/storage/blueprint/view-panel.tsx` | Right panel in View mode: search, front grid, cubby contents |
| `src/components/storage/blueprint/tool-palette.tsx` | Left tool column in Edit mode |
| `src/components/storage/blueprint/storage-workspace.tsx` | Loads, edits, saves; composes canvas + panels |
| `src/components/storage/blueprint/storage-overlay.tsx` | Full-screen shell with unsaved-changes guard |
| `src/app/laboratories/page.tsx` | Lab creation becomes one step; Manage Storage opens the overlay |
| `src/app/samples/storage/page.tsx` | Embeds the workspace |
| `src/app/api/laboratories/[id]/route.ts` | Drop `entrance_*` from PATCH |

Deleted: `src/components/storage/{storage-layout-view,lab-storage-management,shelf-card,shelf-detail-dialog,shelf-assignment-dialog,position-assignment-dialog,position-grid,position-cell,client-storage-view}.tsx`, `src/app/laboratories/page_ENHANCED.tsx`, `src/app/api/laboratories/[id]/storage-layout/`, `src/app/api/laboratories/[id]/shelves/`, `src/app/api/laboratories/[id]/positions/`, `src/app/api/samples/[id]/assign-storage/`, `src/app/api/samples/[id]/suggested-positions/`, `src/app/api/clients/me/storage-layout/`, `src/app/api/clients/me/storage-view/`. (None is called from a live page except through the two components replaced here; the `clients/me` routes and `ClientStorageView` have no caller at all, and they return `tracking_number`.)

---

### Task 1: Database — preflight, schema, functions, scenarios

**Files:**
- Create: `database/migrations/20261007000000_storage_blueprint_preflight.sql`
- Create: `database/migrations/20261007000001_storage_blueprint_schema.sql`
- Create: `database/migrations/20261007000002_storage_blueprint_functions.sql`
- Create: `database/tests/storage_blueprint_scenarios.sql`

**Interfaces:**
- Produces (DB): `laboratories.floor_plan jsonb`; `lab_shelves(x_cm, y_cm, width_cm, depth_cm int not null, rot smallint, access_side text, company_id uuid → companies)`; `storage_positions.company_id uuid → companies`; `samples.storage_position_id uuid → storage_positions ON DELETE SET NULL`.
- Produces (RPC): `storage_lab_occupancy(p_lab uuid) RETURNS TABLE(position_id uuid, occupied int)`; `save_lab_floor_plan(p_lab uuid, p_plan jsonb, p_shelves jsonb) RETURNS jsonb` raising `forbidden` (42501), `invalid_payload` (22023), `unknown_shelf` (22023), `storage_conflict` (P0001, DETAIL = JSON array of messages).

- [ ] **Step 1: Write the preflight query**

`database/migrations/20261007000000_storage_blueprint_preflight.sql`:

```sql
-- Read-only. Run first and paste the result back: the schema migration assumes
-- what this lists. One result set, because the SQL editor shows only the last.
SELECT 'column' AS kind, table_name || '.' || column_name AS name,
       data_type || CASE WHEN is_nullable = 'NO' THEN ' not null' ELSE '' END AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('lab_shelves', 'storage_positions', 'storage_history', 'laboratories', 'samples')
  AND (table_name <> 'samples' OR column_name LIKE 'storage%')
  AND (table_name <> 'laboratories' OR column_name IN ('entrance_x_position', 'entrance_y_position', 'storage_capacity', 'floor_plan'))
UNION ALL
SELECT 'constraint', conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.lab_shelves'::regclass, 'public.storage_positions'::regclass, 'public.storage_history'::regclass)
UNION ALL
SELECT 'policy', tablename || '.' || policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('lab_shelves', 'storage_positions', 'storage_history')
UNION ALL
SELECT 'function', proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('generate_position_code', 'generate_storage_positions_for_shelf', 'get_shelf_utilization',
                  'get_client_samples_in_storage', 'storage_lab_occupancy', 'save_lab_floor_plan')
UNION ALL
SELECT 'view', viewname, '' FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_visible_shelves'
UNION ALL
SELECT 'clients table', COALESCE(to_regclass('public.clients')::text, 'absent'), ''
UNION ALL
SELECT 'samples trigger', tgname, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid = 'public.samples'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'lab', l.name,
       (SELECT count(*) FROM public.lab_shelves s WHERE s.laboratory_id = l.id)::text || ' shelves, '
       || (SELECT count(*) FROM public.storage_positions p WHERE p.laboratory_id = l.id)::text || ' cubbies, '
       || (SELECT count(*) FROM public.samples x WHERE x.laboratory_id = l.id AND x.storage_position IS NOT NULL AND x.deleted_at IS NULL)::text
       || ' samples with a typed position'
FROM public.laboratories l
UNION ALL
SELECT 'shelf', s.laboratory_id::text || ' ' || s.shelf_letter,
       s.rows::text || ' x ' || s.columns::text || ' x ' || s.samples_per_position::text
FROM public.lab_shelves s
ORDER BY 1, 2;
```

- [ ] **Step 2: Write the schema migration**

`database/migrations/20261007000001_storage_blueprint_schema.sql`:

```sql
-- Lab storage blueprint, Part 1: schema.
-- Spec: docs/superpowers/specs/2026-10-07-lab-storage-blueprint-design.md (sections 3 and 7).
--
-- The storage tables still pointed at public.clients, dropped on 2026-05-28 by
-- the counterparty consolidation, so the old floor plan could not load. Zones
-- now reference companies. Shelves get a real footprint in centimetres; the room
-- and its furniture live in laboratories.floor_plan. Occupancy is counted from
-- the samples and never stored. Writes go through save_lab_floor_plan() (next
-- file); lab staff read the tables directly.

BEGIN;

-- 1. Policies first: the old client policy reads lab_shelves.client_id, dropped below.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('lab_shelves', 'storage_positions', 'storage_history')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Room and furniture; the entrance becomes a door item.
ALTER TABLE public.laboratories ADD COLUMN IF NOT EXISTS floor_plan JSONB;
COMMENT ON COLUMN public.laboratories.floor_plan IS
  'Blueprint seen from above, in cm: {version:1, rooms:[{id,x,y,w,d}], items:[{id,kind,label,x,y,w,d,rot}]}';
ALTER TABLE public.laboratories
  DROP COLUMN IF EXISTS entrance_x_position,
  DROP COLUMN IF EXISTS entrance_y_position;

-- 3. Shelves: footprint, zone company, letter rules.
ALTER TABLE public.lab_shelves
  ADD COLUMN IF NOT EXISTS x_cm INTEGER,
  ADD COLUMN IF NOT EXISTS y_cm INTEGER,
  ADD COLUMN IF NOT EXISTS width_cm INTEGER,
  ADD COLUMN IF NOT EXISTS depth_cm INTEGER,
  ADD COLUMN IF NOT EXISTS rot SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_side TEXT NOT NULL DEFAULT 'front',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- A legacy client id is kept only where it is a company id.
UPDATE public.lab_shelves s SET company_id = s.client_id
WHERE s.client_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = s.client_id);

-- Default footprint: 30 cm per column, 40 cm deep, laid in a row 50 cm apart.
WITH laid AS (
  SELECT id,
         GREATEST(columns * 30, 20) AS w,
         50 + COALESCE(SUM(GREATEST(columns * 30, 20) + 50) OVER (
           PARTITION BY laboratory_id ORDER BY shelf_number
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS x
  FROM public.lab_shelves
)
UPDATE public.lab_shelves s
SET width_cm = laid.w, depth_cm = 40, x_cm = laid.x, y_cm = 50
FROM laid
WHERE laid.id = s.id AND s.width_cm IS NULL;

UPDATE public.lab_shelves SET shelf_letter = upper(trim(shelf_letter)) WHERE shelf_letter <> upper(trim(shelf_letter));

ALTER TABLE public.lab_shelves
  ALTER COLUMN x_cm SET NOT NULL,
  ALTER COLUMN y_cm SET NOT NULL,
  ALTER COLUMN width_cm SET NOT NULL,
  ALTER COLUMN depth_cm SET NOT NULL,
  ADD CONSTRAINT lab_shelves_size_valid CHECK (width_cm BETWEEN 20 AND 10000 AND depth_cm BETWEEN 20 AND 10000),
  ADD CONSTRAINT lab_shelves_place_valid CHECK (x_cm BETWEEN 0 AND 10000 AND y_cm BETWEEN 0 AND 10000),
  ADD CONSTRAINT lab_shelves_rot_valid CHECK (rot IN (0, 90, 180, 270)),
  ADD CONSTRAINT lab_shelves_access_side_valid CHECK (access_side IN ('front', 'both')),
  ADD CONSTRAINT lab_shelves_grid_valid CHECK (rows BETWEEN 1 AND 26 AND columns BETWEEN 1 AND 99 AND samples_per_position BETWEEN 1 AND 500),
  ADD CONSTRAINT lab_shelves_letter_format CHECK (shelf_letter ~ '^[A-Z]{1,2}$'),
  -- Deferred so one save can swap two letters (A <-> B).
  ADD CONSTRAINT lab_shelves_lab_letter_key UNIQUE (laboratory_id, shelf_letter) DEFERRABLE INITIALLY DEFERRED;

-- 4. Legacy objects that join clients or keep counters by hand.
DROP VIEW IF EXISTS public.client_visible_shelves;
DROP FUNCTION IF EXISTS public.get_client_samples_in_storage(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_shelf_utilization(uuid);
DROP FUNCTION IF EXISTS public.generate_storage_positions_for_shelf(uuid);
ALTER TABLE public.lab_shelves
  DROP COLUMN IF EXISTS client_id,
  DROP COLUMN IF EXISTS x_position,
  DROP COLUMN IF EXISTS y_position;

-- 5. Cubbies: zone company; occupancy is counted, not stored.
ALTER TABLE public.storage_positions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
UPDATE public.storage_positions sp SET company_id = sp.client_id
WHERE sp.client_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = sp.client_id);
ALTER TABLE public.storage_positions
  DROP COLUMN IF EXISTS is_available,
  DROP COLUMN IF EXISTS current_count,
  DROP COLUMN IF EXISTS current_samples,
  DROP COLUMN IF EXISTS client_id;
CREATE INDEX IF NOT EXISTS idx_storage_positions_company
  ON public.storage_positions(company_id) WHERE company_id IS NOT NULL;

-- 6. History survives a cubby being removed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.storage_history'::regclass AND contype = 'f'
             AND pg_get_constraintdef(oid) LIKE '%storage_positions%'
  LOOP
    EXECUTE format('ALTER TABLE public.storage_history DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.storage_history
  ADD CONSTRAINT storage_history_position_id_fkey
  FOREIGN KEY (position_id) REFERENCES public.storage_positions(id) ON DELETE SET NULL;

-- 7. Samples point at their cubby; the text code stays for existing readers.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS storage_position_id UUID REFERENCES public.storage_positions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_samples_storage_position_id
  ON public.samples(storage_position_id) WHERE storage_position_id IS NOT NULL;
UPDATE public.samples s SET storage_position_id = sp.id
FROM public.storage_positions sp
WHERE s.storage_position_id IS NULL
  AND s.storage_position IS NOT NULL
  AND sp.laboratory_id = s.laboratory_id
  AND sp.position_code = upper(trim(s.storage_position));

-- 8. Lab staff read; nobody writes directly (writes go through definer functions).
ALTER TABLE public.lab_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY storage_staff_select ON public.lab_shelves FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.is_global_admin = true OR COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer'))));
CREATE POLICY storage_staff_select ON public.storage_positions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.is_global_admin = true OR COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer'))));
CREATE POLICY storage_staff_select ON public.storage_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.is_global_admin = true OR COALESCE(p.qc_role::text, '') NOT IN ('', 'client', 'supplier', 'buyer'))));

COMMIT;
```

- [ ] **Step 3: Write the functions migration**

`database/migrations/20261007000002_storage_blueprint_functions.sql`:

```sql
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
```

- [ ] **Step 4: Write the scenario script**

`database/tests/storage_blueprint_scenarios.sql`:

```sql
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
  v_user uuid;
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

  -- 6. A lab user without a management role is refused.
  v_user := (SELECT id FROM public.profiles
             WHERE qc_role::text = 'lab_personnel' AND COALESCE(is_global_admin, false) = false LIMIT 1);
  IF v_user IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    v_ok := false;
    BEGIN
      PERFORM public.save_lab_floor_plan(v_lab, '{"version":1,"rooms":[],"items":[]}'::jsonb, '[]'::jsonb);
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok := true;
    END;
    IF NOT v_ok THEN RAISE EXCEPTION 'scenario 6: lab_personnel could save a plan'; END IF;
  END IF;
END $$;

ROLLBACK;
```

- [ ] **Step 5: Lint the SQL for the editor traps**

Run:
```bash
grep -nEi "\bINTO\s+v_|RETURNING[^;]*\bINTO\b|CREATE\s+(TEMP|TABLE)" database/migrations/20261007000001_storage_blueprint_schema.sql database/migrations/20261007000002_storage_blueprint_functions.sql database/tests/storage_blueprint_scenarios.sql
```
Expected: no output.

- [ ] **Step 6: Commit and hand the SQL to Daniel**

```bash
git add database/migrations/20261007000000_storage_blueprint_preflight.sql database/migrations/20261007000001_storage_blueprint_schema.sql database/migrations/20261007000002_storage_blueprint_functions.sql database/tests/storage_blueprint_scenarios.sql
git commit -m "feat(storage): blueprint schema, companies zones, save_lab_floor_plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Paste to Daniel, in this order, each as its own block: the preflight; then (after he pastes its result back and you adjust the migration for anything it contradicts — e.g. a `position_layout` CHECK that rejects `'grid'`, a shelf letter or grid outside the new CHECKs, a `samples` trigger that reacts to every column) the schema migration; then the functions migration; then the scenario script. Continue with Task 2 while waiting; Task 10 needs his confirmation that all four ran clean.

---

### Task 2: Floor-plan model and geometry

**Files:**
- Create: `src/lib/storage/floor-plan.ts`
- Create: `src/lib/storage/geometry.ts`
- Test: `src/lib/storage/floor-plan.test.ts`
- Test: `src/lib/storage/geometry.test.ts`

**Interfaces:**
- Produces: types `Rotation`, `FloorItemKind`, `AccessSide`, `Rect`, `FloorRoom`, `FloorItem`, `FloorPlan`, `ShelfInput`; constants `ROTATIONS`, `FLOOR_ITEM_KINDS`, `FLOOR_ITEM_LABELS`, `MIN_SIZE_CM`, `MAX_PLAN_CM`, `MAX_ROWS`, `MAX_COLUMNS`, `MAX_CUBBY_CAPACITY`, `EMPTY_FLOOR_PLAN`; `parseFloorPlan(input: unknown): Parsed<FloorPlan>`; `parseShelfInputs(input: unknown): Parsed<ShelfInput[]>`; `rowLetter(row: number): string`; `positionCode(letter: string, row: number, column: number): string`. `type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }`.
- Produces: `SNAP_CM`, `HANDLES`, `type Handle`, `type Segment`; `snap(v, free?)`, `footprint(r)`, `fromFootprint(fp, rot)`, `rotateQuarter(rot)`, `moveRect(r, dx, dy, free?)`, `resizeRect(r, handle, px, py, free?)`, `rectFromDrag(ax, ay, bx, by, free?)`, `rectsOverlap(a, b)`, `overlappingKeys(shapes: {key: string; rect: Rect}[]): Set<string>`, `outlineSegments(rects: Rect[]): Segment[]`, `planBounds(rects: Rect[], pad?: number): Rect`.

- [ ] **Step 1: Write the failing tests**

`src/lib/storage/floor-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN, parseFloorPlan, parseShelfInputs, positionCode } from './floor-plan'

const shelf = (over: Record<string, unknown> = {}) => ({
  shelf_letter: 'a', rows: 6, columns: 4, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front', ...over,
})

describe('parseFloorPlan', () => {
  it('treats a missing plan as an empty room', () => {
    expect(parseFloorPlan(null)).toEqual({ ok: true, value: EMPTY_FLOOR_PLAN })
  })

  it('accepts rooms and items in whole centimetres', () => {
    const plan = {
      version: 1,
      rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }],
      items: [{ id: 'i1', kind: 'door', label: ' Entrance ', x: 0, y: 580, w: 90, d: 20, rot: 0 }],
    }
    const parsed = parseFloorPlan(plan)
    expect(parsed.ok && parsed.value.items[0].label).toBe('Entrance')
  })

  it('refuses a shape smaller than 20 cm, a fractional size and an unknown kind', () => {
    const base = { version: 1, rooms: [], items: [] }
    expect(parseFloorPlan({ ...base, rooms: [{ id: 'r', x: 0, y: 0, w: 10, d: 600 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, rooms: [{ id: 'r', x: 0.5, y: 0, w: 100, d: 100 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, items: [{ id: 'i', kind: 'sofa', label: null, x: 0, y: 0, w: 50, d: 50, rot: 0 }] }).ok).toBe(false)
    expect(parseFloorPlan({ ...base, items: [{ id: 'i', kind: 'bench', label: null, x: 0, y: 0, w: 50, d: 50, rot: 45 }] }).ok).toBe(false)
  })
})

describe('parseShelfInputs', () => {
  it('upper-cases letters and keeps an existing id', () => {
    const id = '7d3c1f9e-2a4b-4c5d-8e6f-0a1b2c3d4e5f'
    const parsed = parseShelfInputs([shelf({ id })])
    expect(parsed).toEqual({ ok: true, value: [{ ...shelf({ id }), shelf_letter: 'A' }] })
  })

  it('refuses a letter used twice, 27 rows and a capacity of 0', () => {
    expect(parseShelfInputs([shelf(), shelf({ shelf_letter: 'A' })])).toEqual({ ok: false, error: 'Shelf letter A is used twice' })
    expect(parseShelfInputs([shelf({ rows: 27 })]).ok).toBe(false)
    expect(parseShelfInputs([shelf({ samples_per_position: 0 })]).ok).toBe(false)
    expect(parseShelfInputs([shelf({ access_side: 'back' })]).ok).toBe(false)
  })
})

describe('positionCode', () => {
  it('names row 1 A, like the database', () => {
    expect(positionCode('B', 3, 4)).toBe('B-C4')
  })
})
```

`src/lib/storage/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  footprint, fromFootprint, moveRect, outlineSegments, overlappingKeys, planBounds,
  rectFromDrag, rectsOverlap, resizeRect, rotateQuarter, snap,
} from './geometry'

const perimeter = (segs: Array<[number, number, number, number]>) =>
  segs.reduce((sum, [x1, y1, x2, y2]) => sum + Math.abs(x2 - x1) + Math.abs(y2 - y1), 0)

describe('snap', () => {
  it('rounds to the 10 cm grid unless free', () => {
    expect(snap(14)).toBe(10)
    expect(snap(15)).toBe(20)
    expect(snap(14.4, true)).toBe(14)
  })
})

describe('rotation', () => {
  it('swaps width and depth about the centre on a quarter turn', () => {
    expect(footprint({ x: 100, y: 100, w: 120, d: 40, rot: 90 })).toEqual({ x: 140, y: 60, w: 40, d: 120 })
    expect(footprint({ x: 100, y: 100, w: 120, d: 40, rot: 180 })).toEqual({ x: 100, y: 100, w: 120, d: 40 })
  })

  it('round-trips a footprint back to the stored rectangle', () => {
    const r = { x: 100, y: 100, w: 120, d: 40 }
    expect(fromFootprint(footprint({ ...r, rot: 270 }), 270)).toEqual(r)
  })

  it('cycles 0, 90, 180, 270', () => {
    expect(rotateQuarter(270)).toBe(0)
    expect(rotateQuarter(90)).toBe(180)
  })
})

describe('move, resize, draw', () => {
  it('moves onto the grid and never below zero', () => {
    expect(moveRect({ x: 100, y: 100, w: 50, d: 50 }, 13, -200)).toEqual({ x: 110, y: 0, w: 50, d: 50 })
  })

  it('moves the dragged edge and keeps the minimum size', () => {
    expect(resizeRect({ x: 0, y: 0, w: 100, d: 50 }, 'e', 143, 0)).toEqual({ x: 0, y: 0, w: 140, d: 50 })
    expect(resizeRect({ x: 0, y: 0, w: 100, d: 50 }, 'w', 95, 0)).toEqual({ x: 80, y: 0, w: 20, d: 50 })
    expect(resizeRect({ x: 100, y: 100, w: 100, d: 50 }, 'nw', 52, 61)).toEqual({ x: 50, y: 60, w: 150, d: 90 })
  })

  it('lengthens a shelf turned 90 degrees when its bottom handle is dragged', () => {
    const stored = { x: 100, y: 100, w: 120, d: 40 }
    const fp = footprint({ ...stored, rot: 90 })              // { x: 140, y: 60, w: 40, d: 120 }
    const next = fromFootprint(resizeRect(fp, 's', 0, 200), 90)
    expect(next).toEqual({ x: 90, y: 110, w: 140, d: 40 })
  })

  it('draws a rectangle from any two corners, at least 20 cm', () => {
    expect(rectFromDrag(37, 12, 3, 88)).toEqual({ x: 0, y: 10, w: 40, d: 80 })
    expect(rectFromDrag(5, 5, 8, 8)).toEqual({ x: 10, y: 10, w: 20, d: 20 })
  })
})

describe('overlap', () => {
  it('does not count touching edges', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 100, d: 50 }, { x: 100, y: 0, w: 50, d: 50 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 100, d: 50 }, { x: 99, y: 0, w: 50, d: 50 })).toBe(true)
  })

  it('names every shape that overlaps another', () => {
    const keys = overlappingKeys([
      { key: 'a', rect: { x: 0, y: 0, w: 100, d: 50 } },
      { key: 'b', rect: { x: 50, y: 0, w: 100, d: 50 } },
      { key: 'c', rect: { x: 500, y: 0, w: 100, d: 50 } },
    ])
    expect([...keys].sort()).toEqual(['a', 'b'])
  })
})

describe('outlineSegments', () => {
  it('outlines one rectangle', () => {
    expect(perimeter(outlineSegments([{ x: 0, y: 0, w: 100, d: 50 }]))).toBe(300)
  })

  it('outlines an L-shaped room built from two rectangles without the shared wall', () => {
    const segs = outlineSegments([{ x: 0, y: 0, w: 200, d: 100 }, { x: 0, y: 100, w: 100, d: 100 }])
    expect(perimeter(segs)).toBe(800)
  })

  it('ignores an exact duplicate', () => {
    const r = { x: 0, y: 0, w: 100, d: 50 }
    expect(perimeter(outlineSegments([r, r]))).toBe(300)
  })
})

describe('planBounds', () => {
  it('falls back to a 10 x 7 m sheet when empty and pads real shapes', () => {
    expect(planBounds([])).toEqual({ x: 0, y: 0, w: 1000, d: 700 })
    expect(planBounds([{ x: 100, y: 100, w: 3000, d: 2000 }])).toEqual({ x: 50, y: 50, w: 3100, d: 2100 })
    expect(planBounds([{ x: 100, y: 100, w: 300, d: 200 }], 0)).toEqual({ x: 100, y: 100, w: 300, d: 200 })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/storage/floor-plan.test.ts src/lib/storage/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./floor-plan"` / `"./geometry"`.

- [ ] **Step 3: Implement `floor-plan.ts`**

```ts
/**
 * The lab's blueprint as stored in laboratories.floor_plan, and the shelf rows
 * saved with it. Every length is a whole number of centimetres, seen from
 * above, origin top-left; `rot` turns a shape clockwise about its centre
 * (spec 2026-10-07-lab-storage-blueprint-design, section 3).
 */

export type Rotation = 0 | 90 | 180 | 270
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270]

export type FloorItemKind = 'bench' | 'table' | 'cabinet' | 'equipment' | 'door' | 'window' | 'other'
export const FLOOR_ITEM_KINDS: readonly FloorItemKind[] = ['bench', 'table', 'cabinet', 'equipment', 'door', 'window', 'other']
export const FLOOR_ITEM_LABELS: Record<FloorItemKind, string> = {
  bench: 'Bench', table: 'Table', cabinet: 'Cabinet', equipment: 'Equipment', door: 'Door', window: 'Window', other: 'Other',
}

export type AccessSide = 'front' | 'both'

export interface Rect { x: number; y: number; w: number; d: number }
export interface FloorRoom extends Rect { id: string }
export interface FloorItem extends Rect { id: string; kind: FloorItemKind; label: string | null; rot: Rotation }
export interface FloorPlan { version: 1; rooms: FloorRoom[]; items: FloorItem[] }

export interface ShelfInput {
  id?: string
  shelf_letter: string
  rows: number
  columns: number
  samples_per_position: number
  x_cm: number
  y_cm: number
  width_cm: number
  depth_cm: number
  rot: Rotation
  access_side: AccessSide
}

export const MIN_SIZE_CM = 20
export const MAX_PLAN_CM = 10_000
export const MAX_ROWS = 26
export const MAX_COLUMNS = 99
export const MAX_CUBBY_CAPACITY = 500

export const EMPTY_FLOOR_PLAN: FloorPlan = { version: 1, rooms: [], items: [] }

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const LETTER = /^[A-Z]{1,2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

function rectError(r: Record<string, unknown>, what: string): string | null {
  if (!isInt(r.x, 0, MAX_PLAN_CM) || !isInt(r.y, 0, MAX_PLAN_CM)) {
    return `${what}: position must be whole centimetres between 0 and ${MAX_PLAN_CM}`
  }
  if (!isInt(r.w, MIN_SIZE_CM, MAX_PLAN_CM) || !isInt(r.d, MIN_SIZE_CM, MAX_PLAN_CM)) {
    return `${what}: size must be whole centimetres between ${MIN_SIZE_CM} and ${MAX_PLAN_CM}`
  }
  return null
}

/** Validate a stored or submitted plan; null/undefined is an empty room. */
export function parseFloorPlan(input: unknown): Parsed<FloorPlan> {
  if (input === null || input === undefined) return { ok: true, value: EMPTY_FLOOR_PLAN }
  if (!isObj(input) || input.version !== 1) return { ok: false, error: 'Floor plan must be version 1' }
  const { rooms, items } = input
  if (!Array.isArray(rooms) || rooms.length > 50) return { ok: false, error: 'A floor plan has at most 50 room rectangles' }
  if (!Array.isArray(items) || items.length > 500) return { ok: false, error: 'A floor plan has at most 500 items' }

  const outRooms: FloorRoom[] = []
  for (const [i, r] of rooms.entries()) {
    if (!isObj(r) || !isId(r.id)) return { ok: false, error: `Room ${i + 1}: missing id` }
    const err = rectError(r, `Room ${i + 1}`)
    if (err) return { ok: false, error: err }
    outRooms.push({ id: r.id, x: r.x as number, y: r.y as number, w: r.w as number, d: r.d as number })
  }

  const outItems: FloorItem[] = []
  for (const [i, it] of items.entries()) {
    const what = `Item ${i + 1}`
    if (!isObj(it) || !isId(it.id)) return { ok: false, error: `${what}: missing id` }
    if (!FLOOR_ITEM_KINDS.includes(it.kind as FloorItemKind)) return { ok: false, error: `${what}: unknown kind` }
    if (!ROTATIONS.includes(it.rot as Rotation)) return { ok: false, error: `${what}: rotation must be 0, 90, 180 or 270` }
    if (it.label !== null && it.label !== undefined && typeof it.label !== 'string') {
      return { ok: false, error: `${what}: label must be text` }
    }
    const err = rectError(it, what)
    if (err) return { ok: false, error: err }
    const label = typeof it.label === 'string' ? it.label.trim().slice(0, 60) || null : null
    outItems.push({
      id: it.id, kind: it.kind as FloorItemKind, label, rot: it.rot as Rotation,
      x: it.x as number, y: it.y as number, w: it.w as number, d: it.d as number,
    })
  }

  return { ok: true, value: { version: 1, rooms: outRooms, items: outItems } }
}

/** Validate the shelves sent with a plan; letters are upper-cased and must be unique. */
export function parseShelfInputs(input: unknown): Parsed<ShelfInput[]> {
  if (!Array.isArray(input) || input.length > 100) return { ok: false, error: 'A lab has at most 100 shelves' }
  const out: ShelfInput[] = []
  const seen = new Set<string>()
  for (const [i, s] of input.entries()) {
    if (!isObj(s)) return { ok: false, error: `Shelf ${i + 1}: not a shelf` }
    const letter = typeof s.shelf_letter === 'string' ? s.shelf_letter.trim().toUpperCase() : ''
    if (!LETTER.test(letter)) return { ok: false, error: `Shelf ${i + 1}: the letter must be one or two letters A-Z` }
    if (seen.has(letter)) return { ok: false, error: `Shelf letter ${letter} is used twice` }
    seen.add(letter)
    const name = `Shelf ${letter}`
    if (s.id !== undefined && s.id !== null && !(typeof s.id === 'string' && UUID.test(s.id))) {
      return { ok: false, error: `${name}: unknown id` }
    }
    if (!isInt(s.rows, 1, MAX_ROWS)) return { ok: false, error: `${name}: rows must be 1 to ${MAX_ROWS}` }
    if (!isInt(s.columns, 1, MAX_COLUMNS)) return { ok: false, error: `${name}: columns must be 1 to ${MAX_COLUMNS}` }
    if (!isInt(s.samples_per_position, 1, MAX_CUBBY_CAPACITY)) {
      return { ok: false, error: `${name}: samples per cubby must be 1 to ${MAX_CUBBY_CAPACITY}` }
    }
    if (!isInt(s.x_cm, 0, MAX_PLAN_CM) || !isInt(s.y_cm, 0, MAX_PLAN_CM)) {
      return { ok: false, error: `${name}: position must be whole centimetres between 0 and ${MAX_PLAN_CM}` }
    }
    if (!isInt(s.width_cm, MIN_SIZE_CM, MAX_PLAN_CM) || !isInt(s.depth_cm, MIN_SIZE_CM, MAX_PLAN_CM)) {
      return { ok: false, error: `${name}: size must be whole centimetres between ${MIN_SIZE_CM} and ${MAX_PLAN_CM}` }
    }
    if (!ROTATIONS.includes(s.rot as Rotation)) return { ok: false, error: `${name}: rotation must be 0, 90, 180 or 270` }
    if (s.access_side !== 'front' && s.access_side !== 'both') return { ok: false, error: `${name}: access side must be front or both` }
    out.push({
      ...(typeof s.id === 'string' ? { id: s.id } : {}),
      shelf_letter: letter,
      rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm,
      rot: s.rot as Rotation, access_side: s.access_side,
    })
  }
  return { ok: true, value: out }
}

/** Row 1 is A, the top row; mirrors generate_position_code() in the database. */
export function rowLetter(row: number): string {
  return String.fromCharCode(64 + row)
}

export function positionCode(letter: string, row: number, column: number): string {
  return `${letter}-${rowLetter(row)}${column}`
}
```

- [ ] **Step 4: Implement `geometry.ts`**

```ts
/**
 * Plan geometry in whole centimetres. Shapes are stored unrotated (x, y, w, d)
 * with a quarter-turn `rot`; what they cover on the floor is their footprint.
 */
import { MAX_PLAN_CM, MIN_SIZE_CM, type Rect, type Rotation } from './floor-plan'

export const SNAP_CM = 10
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
export type Segment = [x1: number, y1: number, x2: number, y2: number]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function snap(v: number, free = false): number {
  return free ? Math.round(v) : Math.round(v / SNAP_CM) * SNAP_CM
}

/** The axis-aligned area a shape covers: a quarter turn swaps width and depth about the centre. */
export function footprint(r: Rect & { rot?: Rotation }): Rect {
  if (r.rot !== 90 && r.rot !== 270) return { x: r.x, y: r.y, w: r.w, d: r.d }
  const cx = r.x + r.w / 2
  const cy = r.y + r.d / 2
  return { x: Math.round(cx - r.d / 2), y: Math.round(cy - r.w / 2), w: r.d, d: r.w }
}

/** The stored rectangle whose rotated footprint is `fp`. */
export function fromFootprint(fp: Rect, rot: Rotation): Rect {
  if (rot !== 90 && rot !== 270) return { x: fp.x, y: fp.y, w: fp.w, d: fp.d }
  const cx = fp.x + fp.w / 2
  const cy = fp.y + fp.d / 2
  return { x: Math.round(cx - fp.d / 2), y: Math.round(cy - fp.w / 2), w: fp.d, d: fp.w }
}

export function rotateQuarter(rot: Rotation): Rotation {
  return ((rot + 90) % 360) as Rotation
}

export function moveRect(r: Rect, dx: number, dy: number, free = false): Rect {
  return {
    ...r,
    x: clamp(snap(r.x + dx, free), 0, MAX_PLAN_CM),
    y: clamp(snap(r.y + dy, free), 0, MAX_PLAN_CM),
  }
}

/** Move the edge(s) a handle names to the pointer; the opposite edge stays put. */
export function resizeRect(r: Rect, handle: Handle, px: number, py: number, free = false): Rect {
  let left = r.x
  let top = r.y
  let right = r.x + r.w
  let bottom = r.y + r.d
  const sx = snap(px, free)
  const sy = snap(py, free)
  if (handle.includes('w')) left = Math.max(0, Math.min(sx, right - MIN_SIZE_CM))
  if (handle.includes('e')) right = Math.min(MAX_PLAN_CM, Math.max(sx, left + MIN_SIZE_CM))
  if (handle.includes('n')) top = Math.max(0, Math.min(sy, bottom - MIN_SIZE_CM))
  if (handle.includes('s')) bottom = Math.min(MAX_PLAN_CM, Math.max(sy, top + MIN_SIZE_CM))
  return { x: left, y: top, w: right - left, d: bottom - top }
}

export function rectFromDrag(ax: number, ay: number, bx: number, by: number, free = false): Rect {
  const x1 = Math.max(0, snap(Math.min(ax, bx), free))
  const y1 = Math.max(0, snap(Math.min(ay, by), free))
  const x2 = snap(Math.max(ax, bx), free)
  const y2 = snap(Math.max(ay, by), free)
  return { x: x1, y: y1, w: Math.max(MIN_SIZE_CM, x2 - x1), d: Math.max(MIN_SIZE_CM, y2 - y1) }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d
}

export function overlappingKeys(shapes: Array<{ key: string; rect: Rect }>): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (rectsOverlap(shapes[i].rect, shapes[j].rect)) {
        out.add(shapes[i].key)
        out.add(shapes[j].key)
      }
    }
  }
  return out
}

/**
 * The outline of a union of rectangles (an L-shaped room drawn as two): the
 * edges between a covered and an uncovered cell of the compressed grid.
 */
export function outlineSegments(rects: Rect[]): Segment[] {
  if (rects.length === 0) return []
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
  const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.d]))].sort((a, b) => a - b)
  const covered = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false
    const cx = (xs[i] + xs[i + 1]) / 2
    const cy = (ys[j] + ys[j + 1]) / 2
    return rects.some((r) => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.d)
  }
  const segs: Segment[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length; j++) {
      if (covered(i, j - 1) !== covered(i, j)) segs.push([xs[i], ys[j], xs[i + 1], ys[j]])
    }
  }
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length; i++) {
      if (covered(i - 1, j) !== covered(i, j)) segs.push([xs[i], ys[j], xs[i], ys[j + 1]])
    }
  }
  return segs
}

/** Box around everything, padded; a 10 x 7 m sheet when there is nothing yet. */
export function planBounds(rects: Rect[], pad = 50): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 1000, d: 700 }
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.d))
  return { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, d: maxY - minY + 2 * pad }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/storage/floor-plan.test.ts src/lib/storage/geometry.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/floor-plan.ts src/lib/storage/geometry.ts src/lib/storage/floor-plan.test.ts src/lib/storage/geometry.test.ts
git commit -m "feat(storage): floor-plan model and plan geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Storage access rule

**Files:**
- Create: `src/lib/storage/storage-access.ts`
- Test: `src/lib/storage/storage-access.test.ts`

**Interfaces:**
- Consumes: `isInternalStaffProfile` from `src/lib/auth/sample-access.ts`.
- Produces: `interface StorageProfile { qc_role?: string | null; is_global_admin?: boolean | null; laboratory_id?: string | null }`; `canViewLabStorage(p, labId): boolean`; `canEditLabStorage(p, labId): boolean`; `loadStorageProfile(supabase, userId): Promise<StorageProfile | null>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { canEditLabStorage, canViewLabStorage } from './storage-access'

const LAB = 'lab-santos'

describe('lab storage access', () => {
  it('lets every internal user of the lab, and global roles, view', () => {
    expect(canViewLabStorage({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canViewLabStorage({ qc_role: 'lab_personnel', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canViewLabStorage({ qc_role: 'global_finance_admin', laboratory_id: null }, LAB)).toBe(true)
    expect(canViewLabStorage({ qc_role: 'client', laboratory_id: LAB }, LAB)).toBe(false)
    expect(canViewLabStorage(null, LAB)).toBe(false)
  })

  it('lets only admins, global quality admins and that lab quality manager edit', () => {
    expect(canEditLabStorage({ is_global_admin: true }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'global_quality_admin' }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'lab_quality_manager', laboratory_id: LAB }, LAB)).toBe(true)
    expect(canEditLabStorage({ qc_role: 'lab_quality_manager', laboratory_id: 'other' }, LAB)).toBe(false)
    expect(canEditLabStorage({ qc_role: 'lab_personnel', laboratory_id: LAB }, LAB)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/storage/storage-access.test.ts`
Expected: FAIL — cannot resolve `./storage-access`.

- [ ] **Step 3: Implement**

```ts
/**
 * Who may see and who may change a lab's storage. Editing mirrors the check
 * inside save_lab_floor_plan() (migration 20261007000002), which is what
 * actually guards the write.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalStaffProfile } from '@/lib/auth/sample-access'

export interface StorageProfile {
  qc_role?: string | null
  is_global_admin?: boolean | null
  laboratory_id?: string | null
}

export function canViewLabStorage(p: StorageProfile | null | undefined, labId: string): boolean {
  if (!p || !isInternalStaffProfile(p)) return false
  if (p.is_global_admin === true) return true
  if (typeof p.qc_role === 'string' && p.qc_role.startsWith('global_')) return true
  return p.laboratory_id === labId
}

export function canEditLabStorage(p: StorageProfile | null | undefined, labId: string): boolean {
  if (!p) return false
  if (p.is_global_admin === true) return true
  if (p.qc_role === 'global_admin' || p.qc_role === 'global_quality_admin') return true
  return p.qc_role === 'lab_quality_manager' && p.laboratory_id === labId
}

export async function loadStorageProfile(supabase: SupabaseClient, userId: string): Promise<StorageProfile | null> {
  const { data } = await (supabase as any)
    .from('profiles')
    .select('qc_role, is_global_admin, laboratory_id')
    .eq('id', userId)
    .maybeSingle()
  return (data as StorageProfile | null) ?? null
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/storage/storage-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/storage-access.ts src/lib/storage/storage-access.test.ts
git commit -m "feat(storage): who may view and edit a lab's storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Layout assembly and loading

**Files:**
- Create: `src/lib/storage/layout.ts`
- Test: `src/lib/storage/layout.test.ts`

**Interfaces:**
- Consumes: `parseFloorPlan`, `EMPTY_FLOOR_PLAN`, `ShelfInput`, `FloorPlan` (Task 2); `companyDisplayName` (`src/lib/contract-intake-mapping.ts`).
- Produces:
  ```ts
  interface Cubby { id: string; row: number; column: number; code: string; capacity: number; occupied: number; company_id: string | null }
  interface StorageShelf extends ShelfInput { id: string; company_id: string | null; cubbies: Cubby[] }
  interface StorageCompany { id: string; name: string }
  interface StorageLayout { laboratory: { id: string; name: string; floor_plan: FloorPlan; storage_capacity: number }; shelves: StorageShelf[]; companies: StorageCompany[]; can_edit: boolean }
  type LayoutWithoutAccess = Omit<StorageLayout, 'can_edit'>
  function assembleLayout(input: LayoutRows): LayoutWithoutAccess
  function loadStorageLayout(supabase: SupabaseClient, labId: string): Promise<LayoutWithoutAccess | null>
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { assembleLayout } from './layout'
import { EMPTY_FLOOR_PLAN } from './floor-plan'

const shelfRow = {
  id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0 as const, access_side: 'front' as const, company_id: null,
}

describe('assembleLayout', () => {
  it('opens a lab with legacy shelves and no floor plan as an empty room with its shelves', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: null },
      shelves: [shelfRow],
      positions: [
        { id: 'p2', shelf_id: 's-a', row_number: 1, column_number: 2, position_code: 'A-A2', capacity_per_position: 42, company_id: 'co-1' },
        { id: 'p1', shelf_id: 's-a', row_number: 1, column_number: 1, position_code: 'A-A1', capacity_per_position: 42, company_id: null },
      ],
      occupancy: [{ position_id: 'p2', occupied: 7 }],
      companies: [{ id: 'co-1', name: 'Dunkin Brands Inc', fantasy_name: 'Dunkin' }],
    })
    expect(layout.laboratory.floor_plan).toEqual(EMPTY_FLOOR_PLAN)
    expect(layout.laboratory.storage_capacity).toBe(84)
    expect(layout.shelves[0].cubbies.map((c) => [c.code, c.occupied])).toEqual([['A-A1', 0], ['A-A2', 7]])
    expect(layout.companies).toEqual([{ id: 'co-1', name: 'Dunkin' }])
  })

  it('falls back to an empty room when the stored plan is malformed', () => {
    const layout = assembleLayout({
      lab: { id: 'lab', name: 'Santos', floor_plan: { version: 2 } },
      shelves: [], positions: [], occupancy: [], companies: [],
    })
    expect(layout.laboratory.floor_plan).toEqual(EMPTY_FLOOR_PLAN)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/storage/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 3: Implement**

```ts
/**
 * Everything the storage screen draws for one lab: the blueprint, shelves with
 * their cubbies and live occupancy, and the companies that own zones.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { EMPTY_FLOOR_PLAN, parseFloorPlan, type FloorPlan, type ShelfInput } from './floor-plan'

export interface Cubby {
  id: string
  row: number
  column: number
  code: string
  capacity: number
  occupied: number
  company_id: string | null
}

export interface StorageShelf extends ShelfInput {
  id: string
  company_id: string | null
  cubbies: Cubby[]
}

export interface StorageCompany { id: string; name: string }

export interface StorageLayout {
  laboratory: { id: string; name: string; floor_plan: FloorPlan; storage_capacity: number }
  shelves: StorageShelf[]
  companies: StorageCompany[]
  can_edit: boolean
}

export type LayoutWithoutAccess = Omit<StorageLayout, 'can_edit'>

type ShelfRow = Omit<StorageShelf, 'cubbies'>
interface PositionRow {
  id: string
  shelf_id: string
  row_number: number
  column_number: number
  position_code: string
  capacity_per_position: number
  company_id: string | null
}

export interface LayoutRows {
  lab: { id: string; name: string; floor_plan: unknown }
  shelves: ShelfRow[]
  positions: PositionRow[]
  occupancy: Array<{ position_id: string; occupied: number }>
  companies: Array<{ id: string; name: string | null; fantasy_name: string | null }>
}

export function assembleLayout(rows: LayoutRows): LayoutWithoutAccess {
  const plan = parseFloorPlan(rows.lab.floor_plan)
  if (!plan.ok) console.error('[storage] stored floor plan is invalid, showing an empty room:', plan.error)

  const occupied = new Map(rows.occupancy.map((o) => [o.position_id, o.occupied]))
  const byShelf = new Map<string, Cubby[]>()
  for (const p of rows.positions) {
    const list = byShelf.get(p.shelf_id) ?? []
    list.push({
      id: p.id, row: p.row_number, column: p.column_number, code: p.position_code,
      capacity: p.capacity_per_position, occupied: occupied.get(p.id) ?? 0, company_id: p.company_id,
    })
    byShelf.set(p.shelf_id, list)
  }

  const shelves: StorageShelf[] = rows.shelves.map((s) => ({
    ...s,
    cubbies: (byShelf.get(s.id) ?? []).sort((a, b) => a.row - b.row || a.column - b.column),
  }))

  const companies = rows.companies
    .map((c) => ({ id: c.id, name: companyDisplayName(c) || 'Unnamed company' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const storage_capacity = shelves.reduce((sum, s) => sum + s.cubbies.reduce((n, c) => n + c.capacity, 0), 0)

  return {
    laboratory: { id: rows.lab.id, name: rows.lab.name, floor_plan: plan.ok ? plan.value : EMPTY_FLOOR_PLAN, storage_capacity },
    shelves,
    companies,
  }
}

const SHELF_COLUMNS =
  'id, shelf_letter, rows, columns, samples_per_position, x_cm, y_cm, width_cm, depth_cm, rot, access_side, company_id'
const POSITION_COLUMNS = 'id, shelf_id, row_number, column_number, position_code, capacity_per_position, company_id'

export async function loadStorageLayout(supabase: SupabaseClient, labId: string): Promise<LayoutWithoutAccess | null> {
  const db = supabase as any
  const { data: lab, error: labError } = await db
    .from('laboratories').select('id, name, floor_plan').eq('id', labId).maybeSingle()
  if (labError) throw new Error(`laboratory: ${labError.message}`)
  if (!lab) return null

  const [shelvesRes, positionsRes, occupancyRes] = await Promise.all([
    db.from('lab_shelves').select(SHELF_COLUMNS).eq('laboratory_id', labId).order('shelf_letter'),
    db.from('storage_positions').select(POSITION_COLUMNS).eq('laboratory_id', labId),
    db.rpc('storage_lab_occupancy', { p_lab: labId }),
  ])
  if (shelvesRes.error) throw new Error(`lab_shelves: ${shelvesRes.error.message}`)
  if (positionsRes.error) throw new Error(`storage_positions: ${positionsRes.error.message}`)
  if (occupancyRes.error) throw new Error(`storage_lab_occupancy: ${occupancyRes.error.message}`)

  const shelves = (shelvesRes.data ?? []) as ShelfRow[]
  const positions = (positionsRes.data ?? []) as PositionRow[]
  const companyIds = [...new Set([...shelves, ...positions].map((r) => r.company_id).filter((id): id is string => !!id))]
  let companies: LayoutRows['companies'] = []
  if (companyIds.length > 0) {
    const { data, error } = await db.from('companies').select('id, name, fantasy_name').in('id', companyIds)
    if (error) throw new Error(`companies: ${error.message}`)
    companies = data ?? []
  }

  return assembleLayout({ lab, shelves, positions, occupancy: occupancyRes.data ?? [], companies })
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/storage/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/layout.ts src/lib/storage/layout.test.ts
git commit -m "feat(storage): assemble a lab's storage layout with live occupancy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Storage GET + PUT route

**Files:**
- Create: `src/lib/storage/save-errors.ts`
- Create: `src/lib/storage/__fixtures__/fake-supabase.ts`
- Create: `src/app/api/laboratories/[id]/storage/route.ts`
- Test: `src/app/api/laboratories/[id]/storage/route.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `GET /api/laboratories/[id]/storage` → `StorageLayout` (200) | 401 | 403 | 404; `PUT` body `{ floor_plan: FloorPlan; shelves: ShelfInput[] }` → fresh `StorageLayout` (200) | 400 `{ error }` | 403 | 409 `{ error, conflicts: string[] }`.
- Produces: `saveErrorResponse(error: { code?: string; message?: string; details?: string | null }): NextResponse`; `fakeSupabase(opts)` test helper.

- [ ] **Step 1: Write the fake and the failing route test**

`src/lib/storage/__fixtures__/fake-supabase.ts`:

```ts
/**
 * A recording Supabase stand-in for route tests: each table answers with the
 * value given for it (an object for .single()/.maybeSingle() reads, an array
 * for lists), every chained call is logged, and rpc() answers per function.
 */
export interface FakeCall { table: string; op: string; args: unknown[] }
type Result = { data: unknown; error: unknown }

export function fakeSupabase(opts: {
  user?: { id: string } | null
  tables?: Record<string, unknown>
  rpc?: Record<string, Result>
} = {}) {
  const calls: FakeCall[] = []
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user

  const chainFor = (table: string) => {
    const result: Result = { data: opts.tables?.[table] ?? null, error: null }
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args })
          return chain
        }
      },
    })
    return chain
  }

  return {
    calls,
    rpcCalls,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from(table: string) {
      calls.push({ table, op: 'from', args: [] })
      return chainFor(table)
    },
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args })
      return opts.rpc?.[fn] ?? { data: [], error: null }
    },
  }
}
```

`src/app/api/laboratories/[id]/storage/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET, PUT } from './route'

const LAB = 'lab-santos'
const ctx = { params: Promise.resolve({ id: LAB }) }
const tables = (profile: Record<string, unknown>) => ({
  profiles: profile,
  laboratories: { id: LAB, name: 'Santos', floor_plan: null },
  lab_shelves: [],
  storage_positions: [],
  companies: [],
})
const put = (body: unknown) => ({ json: async () => body }) as any
const validBody = {
  floor_plan: { version: 1, rooms: [{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }], items: [] },
  shelves: [{ shelf_letter: 'A', rows: 2, columns: 3, samples_per_position: 42, x_cm: 50, y_cm: 50, width_cm: 120, depth_cm: 40, rot: 0, access_side: 'front' }],
}

describe('GET /api/laboratories/[id]/storage', () => {
  it('returns the layout and whether the user may edit', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: LAB }) })
    const res = await GET({} as any, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.laboratory.name).toBe('Santos')
    expect(body.can_edit).toBe(false)
  })

  it('refuses another lab user and an anonymous request', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: 'other' }) })
    expect((await GET({} as any, ctx)).status).toBe(403)
    state.db = fakeSupabase({ user: null })
    expect((await GET({} as any, ctx)).status).toBe(401)
  })
})

describe('PUT /api/laboratories/[id]/storage', () => {
  const manager = { qc_role: 'lab_quality_manager', laboratory_id: LAB }

  it('saves the parsed plan through save_lab_floor_plan', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(200)
    expect(state.db.rpcCalls).toContainEqual({
      fn: 'save_lab_floor_plan',
      args: { p_lab: LAB, p_plan: validBody.floor_plan, p_shelves: validBody.shelves },
    })
  })

  it('never calls the database for a user who may not edit', async () => {
    state.db = fakeSupabase({ tables: tables({ qc_role: 'lab_personnel', laboratory_id: LAB }) })
    expect((await PUT(put(validBody), ctx)).status).toBe(403)
    expect(state.db.rpcCalls.find((c: { fn: string }) => c.fn === 'save_lab_floor_plan')).toBeUndefined()
  })

  it('answers 400 for an invalid plan', async () => {
    state.db = fakeSupabase({ tables: tables(manager) })
    const res = await PUT(put({ ...validBody, shelves: [{ ...validBody.shelves[0], rows: 40 }] }), ctx)
    expect(res.status).toBe(400)
  })

  it('lists every conflict on 409', async () => {
    state.db = fakeSupabase({
      tables: tables(manager),
      rpc: { save_lab_floor_plan: { data: null, error: { code: 'P0001', message: 'storage_conflict', details: '["Cubby A-B3 holds 2 samples and is outside the new grid"]' } } },
    })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).conflicts).toEqual(['Cubby A-B3 holds 2 samples and is outside the new grid'])
  })

  it('asks for a reload when a shelf vanished elsewhere', async () => {
    state.db = fakeSupabase({
      tables: tables(manager),
      rpc: { save_lab_floor_plan: { data: null, error: { code: '22023', message: 'unknown_shelf' } } },
    })
    const res = await PUT(put(validBody), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/reload/i)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run "src/app/api/laboratories/[id]/storage/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement `save-errors.ts`**

```ts
import { NextResponse } from 'next/server'

/** Turn a save_lab_floor_plan() error into what the editor shows. */
export function saveErrorResponse(error: { code?: string; message?: string; details?: string | null }): NextResponse {
  if (error.code === '42501') {
    return NextResponse.json({ error: "You cannot edit this laboratory's storage" }, { status: 403 })
  }
  if (error.message === 'storage_conflict') {
    let conflicts: string[] = []
    try {
      const parsed = JSON.parse(error.details ?? '[]')
      if (Array.isArray(parsed)) conflicts = parsed.map(String)
    } catch {
      conflicts = []
    }
    return NextResponse.json({ error: 'Some changes would remove space that still holds samples', conflicts }, { status: 409 })
  }
  if (error.message === 'unknown_shelf') {
    return NextResponse.json({ error: 'The plan was changed elsewhere. Reload and try again.', conflicts: [] }, { status: 409 })
  }
  if (error.code === '22023') {
    return NextResponse.json({ error: 'The floor plan is not valid' }, { status: 400 })
  }
  console.error('[storage save]', error)
  return NextResponse.json({ error: 'Failed to save the floor plan' }, { status: 500 })
}
```

- [ ] **Step 4: Implement the route**

`src/app/api/laboratories/[id]/storage/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canEditLabStorage, canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { loadStorageLayout } from '@/lib/storage/layout'
import { parseFloorPlan, parseShelfInputs } from '@/lib/storage/floor-plan'
import { saveErrorResponse } from '@/lib/storage/save-errors'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/laboratories/[id]/storage: blueprint, shelves, cubbies with occupancy, zone companies. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  try {
    const layout = await loadStorageLayout(supabase, id)
    if (!layout) return NextResponse.json({ error: 'Laboratory not found' }, { status: 404 })
    return NextResponse.json({ ...layout, can_edit: canEditLabStorage(profile, id) })
  } catch (error) {
    console.error('[storage GET]', error)
    return NextResponse.json({ error: 'Failed to load storage' }, { status: 500 })
  }
}

/** PUT /api/laboratories/[id]/storage: the whole plan, applied in one transaction. */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canEditLabStorage(profile, id)) {
    return NextResponse.json({ error: "You cannot edit this laboratory's storage" }, { status: 403 })
  }

  let body: { floor_plan?: unknown; shelves?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const plan = parseFloorPlan(body?.floor_plan)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 })
  const shelves = parseShelfInputs(body?.shelves)
  if (!shelves.ok) return NextResponse.json({ error: shelves.error }, { status: 400 })

  const { error } = await (supabase as any).rpc('save_lab_floor_plan', {
    p_lab: id,
    p_plan: plan.value,
    p_shelves: shelves.value,
  })
  if (error) return saveErrorResponse(error)

  try {
    const layout = await loadStorageLayout(supabase, id)
    return NextResponse.json({ ...layout, can_edit: true })
  } catch (loadError) {
    console.error('[storage PUT reload]', loadError)
    return NextResponse.json({ error: 'Saved, but the plan could not be reloaded' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run "src/app/api/laboratories/[id]/storage/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/save-errors.ts src/lib/storage/__fixtures__/fake-supabase.ts "src/app/api/laboratories/[id]/storage/route.ts" "src/app/api/laboratories/[id]/storage/route.test.ts"
git commit -m "feat(storage): GET and PUT a lab's whole storage plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cubby contents and sample search routes

**Files:**
- Create: `src/lib/storage/cubby-samples.ts`
- Test: `src/lib/storage/cubby-samples.test.ts`
- Create: `src/app/api/laboratories/[id]/storage/cubbies/[positionId]/route.ts`
- Create: `src/app/api/laboratories/[id]/storage/search/route.ts`
- Test: `src/app/api/laboratories/[id]/storage/cubbies/[positionId]/route.test.ts`

**Interfaces:**
- Consumes: `sampleLabelText` (`src/lib/sample-reference.ts`), `companyDisplayName`, storage access (Task 3), `fakeSupabase` (Task 5).
- Produces: `interface CubbySampleRow { id: string; label: string; contract: string | null; client: string }`; `buildCubbySampleRows(samples: StoredSampleRow[], certs: CertRow[]): CubbySampleRow[]`; `sanitizeStorageSearch(q: string | null): string`; `STORED_SAMPLE_COLUMNS` (select list without `tracking_number`).
- Produces: `GET /api/laboratories/[id]/storage/cubbies/[positionId]` → `{ cubby: { id, code }, samples: CubbySampleRow[] }`; `GET /api/laboratories/[id]/storage/search?q=` → `{ matches: Array<{ sample_id: string; position_id: string; label: string }> }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/storage/cubby-samples.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCubbySampleRows, sanitizeStorageSearch } from './cubby-samples'

describe('buildCubbySampleRows', () => {
  it('names a sample by its certificate, else its own reference, and never by the SAN number', () => {
    const rows = buildCubbySampleRows(
      [
        { id: 's1', storage_position_id: 'p', wolthers_contract_nr: '42273/26', container_nr: 'HASU 155.201-6', ico_number: null, exporter_sample_number: null, client: { name: 'Dunkin Brands Inc', fantasy_name: 'Dunkin' }, tracking_number: 'SAN-01234/26' } as any,
        { id: 's2', storage_position_id: 'p', wolthers_contract_nr: null, container_nr: 'MSKU 100.000-1', ico_number: null, exporter_sample_number: null, client: null },
      ],
      [{ id: 'c1', sample_id: 's1', certificate_number: 'SAG-011895/26' }],
    )
    expect(rows).toEqual([
      { id: 's2', label: expect.stringContaining('MSKU 100.000-1'), contract: null, client: '' },
      { id: 's1', label: 'SAG-011895/26', contract: '42273/26', client: 'Dunkin' },
    ])
    expect(JSON.stringify(rows)).not.toContain('SAN-')
  })
})

describe('sanitizeStorageSearch', () => {
  it('drops PostgREST syntax and wildcards and needs two characters', () => {
    expect(sanitizeStorageSearch(' 42273,(x)* ')).toBe('42273 x')
    expect(sanitizeStorageSearch('%_')).toBe('')
    expect(sanitizeStorageSearch('a')).toBe('')
    expect(sanitizeStorageSearch(null)).toBe('')
  })
})
```

`src/app/api/laboratories/[id]/storage/cubbies/[positionId]/route.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { fakeSupabase } from '@/lib/storage/__fixtures__/fake-supabase'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { GET } from './route'

const ctx = { params: Promise.resolve({ id: 'lab', positionId: 'p1' }) }

describe('GET cubby contents', () => {
  it('lists the cubby samples without selecting the SAN number', async () => {
    state.db = fakeSupabase({
      tables: {
        profiles: { qc_role: 'lab_personnel', laboratory_id: 'lab' },
        storage_positions: { id: 'p1', position_code: 'B-C4', laboratory_id: 'lab' },
        samples: [{ id: 's1', storage_position_id: 'p1', wolthers_contract_nr: '42273/26', container_nr: 'HASU 1', ico_number: null, exporter_sample_number: null, client: null }],
        certificates: [{ id: 'c1', sample_id: 's1', certificate_number: 'SAG-011895/26' }],
      },
    })
    const res = await GET({} as any, ctx)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cubby).toEqual({ id: 'p1', code: 'B-C4' })
    expect(body.samples[0].label).toBe('SAG-011895/26')
    const sampleSelect = state.db.calls.find((c: any) => c.table === 'samples' && c.op === 'select')
    expect(String(sampleSelect.args[0])).not.toContain('tracking_number')
  })

  it('answers 404 for a cubby of another lab', async () => {
    state.db = fakeSupabase({
      tables: {
        profiles: { is_global_admin: true },
        storage_positions: { id: 'p1', position_code: 'B-C4', laboratory_id: 'other-lab' },
      },
    })
    expect((await GET({} as any, ctx)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/storage/cubby-samples.test.ts "src/app/api/laboratories/[id]/storage/cubbies"`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement `cubby-samples.ts`**

```ts
/**
 * How a stored sample is named on the storage screen: its certificate number
 * once one exists, else its own identifier, with its contract number beside
 * it. The SAN- lab number is a backend key and is never selected here.
 */
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { sampleLabelText } from '@/lib/sample-reference'

export const STORED_SAMPLE_COLUMNS =
  'id, storage_position_id, wolthers_contract_nr, container_nr, ico_number, exporter_sample_number, ' +
  'client:companies!samples_client_id_fkey(name, fantasy_name)'

export interface StoredSampleRow {
  id: string
  storage_position_id: string | null
  wolthers_contract_nr: string | null
  container_nr: string | null
  ico_number: string | null
  exporter_sample_number: string | null
  client: { name: string | null; fantasy_name: string | null } | null
}

export interface CertRow { id: string; sample_id: string; certificate_number: string | null }

export interface CubbySampleRow { id: string; label: string; contract: string | null; client: string }

export function buildCubbySampleRows(samples: StoredSampleRow[], certs: CertRow[]): CubbySampleRow[] {
  const certBySample = new Map(certs.map((c) => [c.sample_id, c]))
  return samples
    .map((s) => {
      const cert = certBySample.get(s.id)
      return {
        id: s.id,
        label: sampleLabelText(
          {
            container_nr: s.container_nr,
            ico_number: s.ico_number,
            exporter_sample_number: s.exporter_sample_number,
            certificate_id: cert?.id ?? null,
            certificate_number: cert?.certificate_number ?? null,
          },
          'Reference pending',
        ),
        contract: s.wolthers_contract_nr?.trim() || null,
        // The embed carries no id; companyDisplayName only reads the two names.
        client: companyDisplayName(s.client ? { id: '', ...s.client } : null),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Characters PostgREST treats as filter syntax, plus LIKE wildcards, become spaces. */
export function sanitizeStorageSearch(q: string | null): string {
  const cleaned = (q ?? '').replace(/[,()*%_\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return cleaned.length >= 2 ? cleaned : ''
}
```

- [ ] **Step 4: Implement the cubby route**

`src/app/api/laboratories/[id]/storage/cubbies/[positionId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import { buildCubbySampleRows, STORED_SAMPLE_COLUMNS, type CertRow, type StoredSampleRow } from '@/lib/storage/cubby-samples'

type Ctx = { params: Promise<{ id: string; positionId: string }> }

/** GET: the live samples in one cubby, named by certificate or reference. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, positionId } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const db = supabase as any
  const { data: cubby } = await db
    .from('storage_positions').select('id, position_code, laboratory_id').eq('id', positionId).maybeSingle()
  if (!cubby || cubby.laboratory_id !== id) return NextResponse.json({ error: 'Cubby not found' }, { status: 404 })

  const { data: samples, error } = await db
    .from('samples').select(STORED_SAMPLE_COLUMNS).eq('storage_position_id', positionId).is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Failed to load the cubby' }, { status: 500 })

  const rows = (samples ?? []) as StoredSampleRow[]
  let certs: CertRow[] = []
  if (rows.length > 0) {
    const { data } = await db
      .from('certificates').select('id, sample_id, certificate_number')
      .in('sample_id', rows.map((s) => s.id)).eq('is_latest', true)
    certs = data ?? []
  }

  return NextResponse.json({
    cubby: { id: cubby.id, code: cubby.position_code },
    samples: buildCubbySampleRows(rows, certs),
  })
}
```

- [ ] **Step 5: Implement the search route**

`src/app/api/laboratories/[id]/storage/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canViewLabStorage, loadStorageProfile } from '@/lib/storage/storage-access'
import {
  buildCubbySampleRows, sanitizeStorageSearch, STORED_SAMPLE_COLUMNS, type CertRow, type StoredSampleRow,
} from '@/lib/storage/cubby-samples'

type Ctx = { params: Promise<{ id: string }> }

const REF_COLUMNS = ['wolthers_contract_nr', 'buyer_contract_nr', 'container_nr', 'ico_number', 'exporter_sample_number']

/** GET ?q=: stored samples of this lab whose certificate, contract or reference matches. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = await loadStorageProfile(supabase, user.id)
  if (!canViewLabStorage(profile, id)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const q = sanitizeStorageSearch(request.nextUrl.searchParams.get('q'))
  if (!q) return NextResponse.json({ matches: [] })
  const pattern = `%${q}%`
  const db = supabase as any

  const stored = () =>
    db.from('samples').select(STORED_SAMPLE_COLUMNS)
      .eq('laboratory_id', id).not('storage_position_id', 'is', null).is('deleted_at', null)

  const { data: certHits } = await db
    .from('certificates').select('sample_id').ilike('certificate_number', pattern).eq('is_latest', true).limit(20)
  const certSampleIds = [...new Set(((certHits ?? []) as Array<{ sample_id: string }>).map((c) => c.sample_id))]

  const [byCert, byRef] = await Promise.all([
    certSampleIds.length > 0 ? stored().in('id', certSampleIds) : Promise.resolve({ data: [] }),
    stored().or(REF_COLUMNS.map((c) => `${c}.ilike."${pattern}"`).join(',')).limit(20),
  ])

  const byId = new Map<string, StoredSampleRow>()
  for (const s of [...(byCert.data ?? []), ...(byRef.data ?? [])] as StoredSampleRow[]) byId.set(s.id, s)
  const samples = [...byId.values()].slice(0, 20)

  let certs: CertRow[] = []
  if (samples.length > 0) {
    const { data } = await db
      .from('certificates').select('id, sample_id, certificate_number')
      .in('sample_id', samples.map((s) => s.id)).eq('is_latest', true)
    certs = data ?? []
  }

  const labels = new Map(buildCubbySampleRows(samples, certs).map((r) => [r.id, r]))
  return NextResponse.json({
    matches: samples.map((s) => {
      const row = labels.get(s.id)
      return {
        sample_id: s.id,
        position_id: s.storage_position_id as string,
        label: [row?.label, row?.contract ? `#${row.contract}` : null].filter(Boolean).join(' · '),
      }
    }),
  })
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/storage/cubby-samples.test.ts "src/app/api/laboratories/[id]/storage"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/cubby-samples.ts src/lib/storage/cubby-samples.test.ts "src/app/api/laboratories/[id]/storage/cubbies" "src/app/api/laboratories/[id]/storage/search"
git commit -m "feat(storage): cubby contents and stored-sample search, named by certificate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Editor state

**Files:**
- Create: `src/components/storage/blueprint/editor-state.ts`
- Create: `src/components/storage/blueprint/use-blueprint-editor.ts`
- Test: `src/components/storage/blueprint/editor-state.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4 types; `rotateQuarter`, `footprint`, `snap`.
- Produces (editor-state.ts):
  ```ts
  type ShapeKind = 'room' | 'item' | 'shelf'
  interface ShapeRef { kind: ShapeKind; key: string }
  interface EditorShelf extends ShelfInput { key: string; company_id: string | null; cubbies: Cubby[] }
  interface EditorDoc { plan: FloorPlan; shelves: EditorShelf[] }
  type Tool = 'select' | 'room' | 'shelf' | FloorItemKind
  type DrawTool = Exclude<Tool, 'select'>
  interface EditorState { doc; past: EditorDoc[]; future: EditorDoc[]; selected: ShapeRef | null; tool: Tool; dirty: boolean }
  type ShapePatch = Partial<Rect> & { rot?: Rotation; label?: string | null; kind?: FloorItemKind; shelf_letter?: string; rows?: number; columns?: number; samples_per_position?: number; access_side?: AccessSide }
  type EditorAction = load | tool | select | checkpoint | add | patch | rotate | delete | undo | redo | saved
  interface ShapeInfo { ref: ShapeRef; rect: Rect; rot: Rotation; fp: Rect; blocks: boolean }
  initialEditorState(doc), editorReducer(state, action), fromLayout(layout), toSavePayload(doc),
  listShapes(doc), findShape(doc, ref), shapeKey(ref), sameRef(a, b), shelfRect(s), nextShelfLetter(letters), defaultRect(tool, at, free)
  ```
- Produces (use-blueprint-editor.ts): `useBlueprintEditor(): { state: EditorState; actions: EditorActions }` where `actions` is memoized once (`load, saved, setTool, select, checkpoint, add, patch(ref, patch, record?), rotate, remove, undo, redo`) so it is safe in effect dependency lists; `useEditorKeyboard(enabled: boolean, selected: ShapeRef | null, actions: EditorActions)` (listens on `document`, so it runs before any `window` listener such as the overlay's Escape); `isTypingTarget(target: EventTarget | null): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { EMPTY_FLOOR_PLAN } from '@/lib/storage/floor-plan'
import {
  editorReducer, initialEditorState, nextShelfLetter, toSavePayload, type EditorDoc,
} from './editor-state'

const shelf = {
  key: 's-a', id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
  x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0 as const, access_side: 'front' as const,
  company_id: null, cubbies: [],
}
const doc: EditorDoc = { plan: EMPTY_FLOOR_PLAN, shelves: [shelf] }

describe('editorReducer', () => {
  it('adds a room, selects it and returns to the select tool', () => {
    const s = editorReducer({ ...initialEditorState(doc), tool: 'room' }, { type: 'add', shape: 'room', id: 'r1', rect: { x: 0, y: 0, w: 800, d: 600 } })
    expect(s.doc.plan.rooms).toEqual([{ id: 'r1', x: 0, y: 0, w: 800, d: 600 }])
    expect(s.selected).toEqual({ kind: 'room', key: 'r1' })
    expect(s.tool).toBe('select')
    expect(s.dirty).toBe(true)
  })

  it('gives a new shelf the next free letter and 42 samples per cubby', () => {
    const s = editorReducer(initialEditorState(doc), { type: 'add', shape: 'shelf', id: 'n1', rect: { x: 200, y: 50, w: 120, d: 40 } })
    expect(s.doc.shelves[1]).toMatchObject({ key: 'n1', shelf_letter: 'B', samples_per_position: 42, x_cm: 200 })
    expect(s.doc.shelves[1].id).toBeUndefined()
  })

  it('records one undo step for a whole drag', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'checkpoint' })
    s = editorReducer(s, { type: 'patch', ref, patch: { x: 60 }, record: false })
    s = editorReducer(s, { type: 'patch', ref, patch: { x: 70 }, record: false })
    expect(s.doc.shelves[0].x_cm).toBe(70)
    s = editorReducer(s, { type: 'undo' })
    expect(s.doc.shelves[0].x_cm).toBe(50)
    s = editorReducer(s, { type: 'redo' })
    expect(s.doc.shelves[0].x_cm).toBe(70)
  })

  it('records inspector edits, rotates and deletes', () => {
    const ref = { kind: 'shelf' as const, key: 's-a' }
    let s = editorReducer(initialEditorState(doc), { type: 'patch', ref, patch: { rows: 3, shelf_letter: ' c ' }, record: true })
    expect(s.doc.shelves[0]).toMatchObject({ rows: 3, shelf_letter: 'C' })
    s = editorReducer(s, { type: 'rotate', ref })
    expect(s.doc.shelves[0].rot).toBe(90)
    s = editorReducer(s, { type: 'delete', ref })
    expect(s.doc.shelves).toEqual([])
    expect(s.selected).toBeNull()
    expect(s.past).toHaveLength(3)
  })
})

describe('helpers', () => {
  it('skips used letters', () => {
    expect(nextShelfLetter(['A', 'B', 'D'])).toBe('C')
    expect(nextShelfLetter('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))).toBe('AA')
  })

  it('sends only what the database stores', () => {
    const payload = toSavePayload(doc)
    expect(payload.shelves[0]).toEqual({
      id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42,
      x_cm: 50, y_cm: 50, width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front',
    })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/storage/blueprint/editor-state.test.ts`
Expected: FAIL — cannot resolve `./editor-state`.

- [ ] **Step 3: Implement `editor-state.ts`**

```ts
/**
 * The blueprint editor's state as a pure reducer: the document being drawn,
 * undo/redo history, selection and the active tool. A drag is one undo step:
 * the canvas sends `checkpoint` on the first movement, then unrecorded patches.
 */
import {
  type AccessSide, type FloorItem, type FloorItemKind, type FloorPlan, type Rect, type Rotation, type ShelfInput,
} from '@/lib/storage/floor-plan'
import { footprint, rotateQuarter, snap } from '@/lib/storage/geometry'
import type { Cubby, StorageLayout } from '@/lib/storage/layout'

export type ShapeKind = 'room' | 'item' | 'shelf'
export interface ShapeRef { kind: ShapeKind; key: string }
export interface EditorShelf extends ShelfInput { key: string; company_id: string | null; cubbies: Cubby[] }
export interface EditorDoc { plan: FloorPlan; shelves: EditorShelf[] }
export type Tool = 'select' | 'room' | 'shelf' | FloorItemKind
export type DrawTool = Exclude<Tool, 'select'>

export interface EditorState {
  doc: EditorDoc
  past: EditorDoc[]
  future: EditorDoc[]
  selected: ShapeRef | null
  tool: Tool
  dirty: boolean
}

export type ShapePatch = Partial<Rect> & {
  rot?: Rotation
  label?: string | null
  kind?: FloorItemKind
  shelf_letter?: string
  rows?: number
  columns?: number
  samples_per_position?: number
  access_side?: AccessSide
}

export type EditorAction =
  | { type: 'load'; doc: EditorDoc }
  | { type: 'tool'; tool: Tool }
  | { type: 'select'; ref: ShapeRef | null }
  | { type: 'checkpoint' }
  | { type: 'add'; shape: DrawTool; rect: Rect; id: string }
  | { type: 'patch'; ref: ShapeRef; patch: ShapePatch; record: boolean }
  | { type: 'rotate'; ref: ShapeRef }
  | { type: 'delete'; ref: ShapeRef }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved'; doc: EditorDoc }

export interface ShapeInfo { ref: ShapeRef; rect: Rect; rot: Rotation; fp: Rect; blocks: boolean }

const HISTORY = 100

export function initialEditorState(doc: EditorDoc): EditorState {
  return { doc, past: [], future: [], selected: null, tool: 'select', dirty: false }
}

export const shapeKey = (ref: ShapeRef): string => `${ref.kind}:${ref.key}`
export const sameRef = (a: ShapeRef | null | undefined, b: ShapeRef | null | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.key === b.key

export function shelfRect(s: Pick<ShelfInput, 'x_cm' | 'y_cm' | 'width_cm' | 'depth_cm'>): Rect {
  return { x: s.x_cm, y: s.y_cm, w: s.width_cm, d: s.depth_cm }
}

const rectOf = (r: Rect): Rect => ({ x: r.x, y: r.y, w: r.w, d: r.d })

export function listShapes(doc: EditorDoc): ShapeInfo[] {
  const rooms: ShapeInfo[] = doc.plan.rooms.map((r) => ({
    ref: { kind: 'room', key: r.id }, rect: rectOf(r), rot: 0, fp: rectOf(r), blocks: false,
  }))
  const items: ShapeInfo[] = doc.plan.items.map((it) => ({
    ref: { kind: 'item', key: it.id }, rect: rectOf(it), rot: it.rot, fp: footprint(it),
    blocks: it.kind !== 'door' && it.kind !== 'window',
  }))
  const shelves: ShapeInfo[] = doc.shelves.map((s) => {
    const rect = shelfRect(s)
    return { ref: { kind: 'shelf', key: s.key }, rect, rot: s.rot, fp: footprint({ ...rect, rot: s.rot }), blocks: true }
  })
  return [...rooms, ...items, ...shelves]
}

export function findShape(doc: EditorDoc, ref: ShapeRef | null): { info: ShapeInfo; item?: FloorItem; shelf?: EditorShelf } | null {
  if (!ref) return null
  const info = listShapes(doc).find((s) => sameRef(s.ref, ref))
  if (!info) return null
  if (ref.kind === 'item') return { info, item: doc.plan.items.find((i) => i.id === ref.key) }
  if (ref.kind === 'shelf') return { info, shelf: doc.shelves.find((s) => s.key === ref.key) }
  return { info }
}

export function nextShelfLetter(existing: string[]): string {
  const used = new Set(existing.map((l) => l.toUpperCase()))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const l of letters) if (!used.has(l)) return l
  for (const a of letters) for (const b of letters) if (!used.has(a + b)) return a + b
  return 'ZZ'
}

const DEFAULT_SIZES: Record<DrawTool, { w: number; d: number }> = {
  room: { w: 600, d: 400 }, shelf: { w: 120, d: 40 }, bench: { w: 200, d: 70 }, table: { w: 160, d: 80 },
  cabinet: { w: 100, d: 50 }, equipment: { w: 80, d: 60 }, door: { w: 90, d: 20 }, window: { w: 120, d: 20 },
  other: { w: 100, d: 60 },
}

/** A click without a drag places the shape at its usual size, centred on the click. */
export function defaultRect(tool: DrawTool, at: { x: number; y: number }, free = false): Rect {
  const { w, d } = DEFAULT_SIZES[tool]
  return { x: Math.max(0, snap(at.x - w / 2, free)), y: Math.max(0, snap(at.y - d / 2, free)), w, d }
}

export function fromLayout(layout: Pick<StorageLayout, 'laboratory' | 'shelves'>): EditorDoc {
  return {
    plan: layout.laboratory.floor_plan,
    shelves: layout.shelves.map((s) => ({ ...s, key: s.id })),
  }
}

export function toSavePayload(doc: EditorDoc): { floor_plan: FloorPlan; shelves: ShelfInput[] } {
  return {
    floor_plan: doc.plan,
    shelves: doc.shelves.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
    })),
  }
}

function pickRect(p: ShapePatch): Partial<Rect> {
  const out: Partial<Rect> = {}
  if (p.x !== undefined) out.x = p.x
  if (p.y !== undefined) out.y = p.y
  if (p.w !== undefined) out.w = p.w
  if (p.d !== undefined) out.d = p.d
  return out
}

function patchShelf(s: EditorShelf, p: ShapePatch): EditorShelf {
  return {
    ...s,
    ...(p.x !== undefined ? { x_cm: p.x } : {}),
    ...(p.y !== undefined ? { y_cm: p.y } : {}),
    ...(p.w !== undefined ? { width_cm: p.w } : {}),
    ...(p.d !== undefined ? { depth_cm: p.d } : {}),
    ...(p.rot !== undefined ? { rot: p.rot } : {}),
    ...(p.shelf_letter !== undefined ? { shelf_letter: p.shelf_letter.trim().toUpperCase() } : {}),
    ...(p.rows !== undefined ? { rows: p.rows } : {}),
    ...(p.columns !== undefined ? { columns: p.columns } : {}),
    ...(p.samples_per_position !== undefined ? { samples_per_position: p.samples_per_position } : {}),
    ...(p.access_side !== undefined ? { access_side: p.access_side } : {}),
  }
}

function applyPatch(doc: EditorDoc, ref: ShapeRef, p: ShapePatch): EditorDoc {
  if (ref.kind === 'room') {
    return { ...doc, plan: { ...doc.plan, rooms: doc.plan.rooms.map((r) => (r.id === ref.key ? { ...r, ...pickRect(p) } : r)) } }
  }
  if (ref.kind === 'item') {
    return {
      ...doc,
      plan: {
        ...doc.plan,
        items: doc.plan.items.map((it) =>
          it.id === ref.key
            ? {
                ...it,
                ...pickRect(p),
                ...(p.rot !== undefined ? { rot: p.rot } : {}),
                ...(p.label !== undefined ? { label: p.label?.trim() || null } : {}),
                ...(p.kind !== undefined ? { kind: p.kind } : {}),
              }
            : it,
        ),
      },
    }
  }
  return { ...doc, shelves: doc.shelves.map((s) => (s.key === ref.key ? patchShelf(s, p) : s)) }
}

function removeShape(doc: EditorDoc, ref: ShapeRef): EditorDoc {
  if (ref.kind === 'room') return { ...doc, plan: { ...doc.plan, rooms: doc.plan.rooms.filter((r) => r.id !== ref.key) } }
  if (ref.kind === 'item') return { ...doc, plan: { ...doc.plan, items: doc.plan.items.filter((i) => i.id !== ref.key) } }
  return { ...doc, shelves: doc.shelves.filter((s) => s.key !== ref.key) }
}

function recorded(s: EditorState, doc: EditorDoc, extra: Partial<EditorState> = {}): EditorState {
  return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [], doc, dirty: true, ...extra }
}

function keepSelection(doc: EditorDoc, ref: ShapeRef | null): ShapeRef | null {
  return ref && listShapes(doc).some((x) => sameRef(x.ref, ref)) ? ref : null
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'load':
      return initialEditorState(a.doc)
    case 'saved':
      return { ...initialEditorState(a.doc), selected: keepSelection(a.doc, s.selected) }
    case 'tool':
      return { ...s, tool: a.tool }
    case 'select':
      return { ...s, selected: a.ref }
    case 'checkpoint':
      return { ...s, past: [...s.past, s.doc].slice(-HISTORY), future: [] }
    case 'add': {
      const { shape, rect, id } = a
      if (shape === 'room') {
        const doc = { ...s.doc, plan: { ...s.doc.plan, rooms: [...s.doc.plan.rooms, { id, ...rect }] } }
        return recorded(s, doc, { selected: { kind: 'room', key: id }, tool: 'select' })
      }
      if (shape === 'shelf') {
        const shelf: EditorShelf = {
          key: id, shelf_letter: nextShelfLetter(s.doc.shelves.map((x) => x.shelf_letter)),
          rows: 6, columns: 4, samples_per_position: 42,
          x_cm: rect.x, y_cm: rect.y, width_cm: rect.w, depth_cm: rect.d, rot: 0, access_side: 'front',
          company_id: null, cubbies: [],
        }
        return recorded(s, { ...s.doc, shelves: [...s.doc.shelves, shelf] }, { selected: { kind: 'shelf', key: id }, tool: 'select' })
      }
      const item: FloorItem = { id, kind: shape, label: null, rot: 0, ...rect }
      const doc = { ...s.doc, plan: { ...s.doc.plan, items: [...s.doc.plan.items, item] } }
      return recorded(s, doc, { selected: { kind: 'item', key: id }, tool: 'select' })
    }
    case 'patch': {
      const doc = applyPatch(s.doc, a.ref, a.patch)
      return a.record ? recorded(s, doc) : { ...s, doc, dirty: true }
    }
    case 'rotate': {
      if (a.ref.kind === 'room') return s
      const found = findShape(s.doc, a.ref)
      if (!found) return s
      return recorded(s, applyPatch(s.doc, a.ref, { rot: rotateQuarter(found.info.rot) }))
    }
    case 'delete':
      return recorded(s, removeShape(s.doc, a.ref), { selected: null })
    case 'undo': {
      if (s.past.length === 0) return s
      const doc = s.past[s.past.length - 1]
      return { ...s, doc, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true, selected: keepSelection(doc, s.selected) }
    }
    case 'redo': {
      if (s.future.length === 0) return s
      const [doc, ...rest] = s.future
      return { ...s, doc, past: [...s.past, s.doc], future: rest, dirty: true, selected: keepSelection(doc, s.selected) }
    }
  }
}
```

- [ ] **Step 4: Implement `use-blueprint-editor.ts`**

```ts
'use client'

import { useEffect, useMemo, useReducer } from 'react'
import { EMPTY_FLOOR_PLAN, type Rect } from '@/lib/storage/floor-plan'
import {
  editorReducer, initialEditorState, type DrawTool, type EditorDoc, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useBlueprintEditor() {
  const [state, dispatch] = useReducer(editorReducer, { plan: EMPTY_FLOOR_PLAN, shelves: [] }, initialEditorState)
  const actions = useMemo(() => ({
    load: (doc: EditorDoc) => dispatch({ type: 'load', doc }),
    saved: (doc: EditorDoc) => dispatch({ type: 'saved', doc }),
    setTool: (tool: Tool) => dispatch({ type: 'tool', tool }),
    select: (ref: ShapeRef | null) => dispatch({ type: 'select', ref }),
    checkpoint: () => dispatch({ type: 'checkpoint' }),
    add: (shape: DrawTool, rect: Rect) => dispatch({ type: 'add', shape, rect, id: newId() }),
    patch: (ref: ShapeRef, patch: ShapePatch, record = false) => dispatch({ type: 'patch', ref, patch, record }),
    rotate: (ref: ShapeRef) => dispatch({ type: 'rotate', ref }),
    remove: (ref: ShapeRef) => dispatch({ type: 'delete', ref }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
  }), [])
  // `actions` never changes identity, so callers can list it in effect dependencies.
  return { state, actions }
}

export type EditorActions = ReturnType<typeof useBlueprintEditor>['actions']

/**
 * Delete, R, Escape, Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z while editing. Listens on
 * `document`, which an event reaches before `window`, so an Escape that only
 * deselects is marked handled before the overlay's window listener sees it.
 */
export function useEditorKeyboard(enabled: boolean, selected: ShapeRef | null, actions: EditorActions) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) actions.redo()
        else actions.undo()
        return
      }
      if (e.key === 'Escape' && selected) {
        e.preventDefault()
        actions.select(null)
        return
      }
      if (!selected) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actions.remove(selected)
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        actions.rotate(selected)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, selected, actions])
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/storage/blueprint/editor-state.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/storage/blueprint/editor-state.ts src/components/storage/blueprint/use-blueprint-editor.ts src/components/storage/blueprint/editor-state.test.ts
git commit -m "feat(storage): blueprint editor state with one undo step per drag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Canvas, shapes, front grid, inspector, panels

**Files:**
- Create: `src/components/storage/blueprint/zone-colors.ts`
- Create: `src/components/storage/blueprint/shapes.tsx`
- Create: `src/components/storage/blueprint/blueprint-canvas.tsx`
- Create: `src/components/storage/blueprint/shelf-front-grid.tsx`
- Create: `src/components/storage/blueprint/inspector.tsx`
- Create: `src/components/storage/blueprint/view-panel.tsx`
- Create: `src/components/storage/blueprint/tool-palette.tsx`
- Test: `src/components/storage/blueprint/shelf-front-grid.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 4, 6, 7.
- Produces: `ZONE_PALETTE`, `interface ZoneStyle { color: string; hatched: boolean }`, `zoneStyles(companyIds: string[]): Map<string, ZoneStyle>`; `<ShelfShape>`, `<ItemShape>`; `<BlueprintCanvas {doc, mode, tool, selected, zones, highlightShelfKey, fitToken, onSelect, onCheckpoint, onPatch, onAdd}>`; `<ShelfFrontGrid {letter, rows, columns, capacity, cubbies, zones, highlightCubbyId?, onCubbyClick?}>`; `<Inspector {doc, selected, zones, onPatch, onRotate, onDelete}>`; `<ViewPanel {laboratoryId, doc, selectedShelfKey, zones, highlightCubbyId, onFound}>`; `<ToolPalette {tool, onTool}>`.

- [ ] **Step 1: Write the failing front-grid test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShelfFrontGrid } from './shelf-front-grid'
import { zoneStyles } from './zone-colors'

describe('ShelfFrontGrid', () => {
  it('draws one square per cubby with its fill, and reports clicks', () => {
    const onCubbyClick = vi.fn()
    const cubby = { id: 'p1', row: 1, column: 2, code: 'B-A2', capacity: 42, occupied: 31, company_id: 'co-1' }
    render(
      <ShelfFrontGrid letter="B" rows={2} columns={3} capacity={42} cubbies={[cubby]}
        zones={zoneStyles(['co-1'])} onCubbyClick={onCubbyClick} />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(6)
    const filled = screen.getByTestId('cubby-B-A2')
    expect(filled).toHaveTextContent('31/42')
    expect(screen.getByTestId('cubby-B-B3')).toHaveTextContent('0/42')
    fireEvent.click(filled)
    expect(onCubbyClick).toHaveBeenCalledWith(cubby, 1, 2)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/storage/blueprint/shelf-front-grid.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement `zone-colors.ts` and `shelf-front-grid.tsx`**

`zone-colors.ts`:

```ts
/** Chart palette from CLAUDE.md; past six companies the colours repeat with a hatch. */
export const ZONE_PALETTE = ['#556b2f', '#a9a454', '#b07946', '#445763', '#efe4d4', '#151618'] as const

export interface ZoneStyle { color: string; hatched: boolean }

/** One style per company, in the order given (the layout lists companies by name). */
export function zoneStyles(companyIds: string[]): Map<string, ZoneStyle> {
  return new Map(
    companyIds.map((id, i) => [id, { color: ZONE_PALETTE[i % ZONE_PALETTE.length], hatched: i >= ZONE_PALETTE.length }]),
  )
}
```

`shelf-front-grid.tsx`:

```tsx
'use client'

import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { rowLetter } from '@/lib/storage/floor-plan'
import type { Cubby } from '@/lib/storage/layout'
import type { ZoneStyle } from './zone-colors'

interface ShelfFrontGridProps {
  letter: string
  rows: number
  columns: number
  /** Samples per cubby, for cubbies the database has not created yet. */
  capacity: number
  cubbies: Cubby[]
  zones: Map<string, ZoneStyle>
  highlightCubbyId?: string | null
  onCubbyClick?: (cubby: Cubby | null, row: number, column: number) => void
}

/** A shelf seen from the front: row A on top, column 1 on the left, one square per cubby. */
export function ShelfFrontGrid({
  letter, rows, columns, capacity, cubbies, zones, highlightCubbyId, onCubbyClick,
}: ShelfFrontGridProps) {
  const byPosition = new Map(cubbies.map((c) => [`${c.row}:${c.column}`, c]))
  return (
    <div className="overflow-auto">
      <div
        className="inline-grid gap-px bg-border"
        style={{ gridTemplateColumns: `1.5rem repeat(${columns}, minmax(3.25rem, 1fr))` }}
      >
        <div className="bg-background" />
        {Array.from({ length: columns }, (_, c) => (
          <div key={`col-${c}`} className="bg-background text-center text-[11px] text-muted-foreground">{c + 1}</div>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <Fragment key={`row-${r}`}>
            <div className="flex items-center justify-center bg-background text-[11px] text-muted-foreground">
              {rowLetter(r + 1)}
            </div>
            {Array.from({ length: columns }, (_, c) => {
              const cubby = byPosition.get(`${r + 1}:${c + 1}`) ?? null
              const zone = cubby?.company_id ? zones.get(cubby.company_id) : undefined
              const occupied = cubby?.occupied ?? 0
              const cap = cubby?.capacity ?? capacity
              const code = `${letter}-${rowLetter(r + 1)}${c + 1}`
              return (
                <button
                  key={code}
                  type="button"
                  data-testid={`cubby-${code}`}
                  aria-label={`${code}, ${occupied} of ${cap}`}
                  onClick={() => onCubbyClick?.(cubby, r + 1, c + 1)}
                  className={cn(
                    'h-12 bg-background px-1.5 text-left text-[11px] tabular-nums hover:bg-muted',
                    occupied >= cap && 'font-semibold',
                    cubby && cubby.id === highlightCubbyId && 'outline outline-2 -outline-offset-2 outline-foreground',
                  )}
                  style={zone ? {
                    backgroundColor: `${zone.color}24`,
                    boxShadow: `inset 3px 0 0 ${zone.color}`,
                    backgroundImage: zone.hatched
                      ? `repeating-linear-gradient(45deg, ${zone.color}33 0 4px, transparent 4px 8px)`
                      : undefined,
                  } : undefined}
                >
                  <span className="block">{code}</span>
                  <span className="block text-muted-foreground">{occupied}/{cap}</span>
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the grid test**

Run: `npx vitest run src/components/storage/blueprint/shelf-front-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `shapes.tsx`**

```tsx
'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { FLOOR_ITEM_LABELS, type FloorItem } from '@/lib/storage/floor-plan'
import type { EditorShelf } from './editor-state'
import type { ZoneStyle } from './zone-colors'

type Down = (e: ReactPointerEvent) => void

/** A shelf from above: outline, zone tint by share of cubbies, fill bar, thick front edge, letter. */
export function ShelfShape({ shelf, cmPerPx, zones, highlighted, onPointerDown }: {
  shelf: EditorShelf
  cmPerPx: number
  zones: Map<string, ZoneStyle>
  highlighted: boolean
  onPointerDown: Down
}) {
  const { x_cm: x, y_cm: y, width_cm: w, depth_cm: d, rot } = shelf
  const cx = x + w / 2
  const cy = y + d / 2
  const total = shelf.rows * shelf.columns
  const capacity = total * shelf.samples_per_position
  const occupied = shelf.cubbies.reduce((n, c) => n + c.occupied, 0)

  const counts = new Map<string, number>()
  for (const c of shelf.cubbies) if (c.company_id) counts.set(c.company_id, (counts.get(c.company_id) ?? 0) + 1)
  let offset = 0
  const stripes = [...counts].map(([id, n]) => {
    const width = total > 0 ? (w * n) / total : 0
    const style = zones.get(id)
    const el = style ? <rect key={id} x={x + offset} y={y} width={width} height={d} fill={style.color} fillOpacity={0.22} /> : null
    offset += width
    return el
  })

  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} onPointerDown={onPointerDown} className="cursor-pointer" data-testid={`shelf-${shelf.shelf_letter}`}>
      <rect x={x} y={y} width={w} height={d} className="fill-background" />
      {stripes}
      <rect x={x} y={y + d * 0.85} width={capacity > 0 ? (w * occupied) / capacity : 0} height={d * 0.15} className="fill-foreground" fillOpacity={0.35} />
      <rect x={x} y={y} width={w} height={d} fill="none" className="stroke-foreground" strokeWidth={highlighted ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
      <line x1={x} y1={y + d} x2={x + w} y2={y + d} className="stroke-foreground" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
      {shelf.access_side === 'both' && (
        <line x1={x} y1={y} x2={x + w} y2={y} className="stroke-foreground" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
      )}
      <text
        x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={14 * cmPerPx} fontWeight={600}
        className="pointer-events-none select-none fill-foreground" transform={`rotate(${-rot} ${cx} ${cy})`}
      >
        {shelf.shelf_letter}
      </text>
    </g>
  )
}

/** Furniture, doors and windows from above. */
export function ItemShape({ item, cmPerPx, onPointerDown }: { item: FloorItem; cmPerPx: number; onPointerDown: Down }) {
  const { x, y, w, d, rot } = item
  const cx = x + w / 2
  const cy = y + d / 2
  const label = item.label || FLOOR_ITEM_LABELS[item.kind]
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} onPointerDown={onPointerDown} className="cursor-pointer" data-testid={`item-${item.id}`}>
      {item.kind === 'door' ? (
        <>
          <rect x={x} y={y} width={w} height={d} className="fill-background stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={`M ${x} ${y + d} L ${x} ${y + d - w} A ${w} ${w} 0 0 1 ${x + w} ${y + d}`} fill="none" className="stroke-foreground" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      ) : item.kind === 'window' ? (
        <>
          <rect x={x} y={y} width={w} height={d} className="fill-background stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={x} y1={cy} x2={x + w} y2={cy} className="stroke-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <rect x={x} y={y} width={w} height={d} className="fill-muted stroke-muted-foreground" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {item.kind !== 'door' && item.kind !== 'window' && (
        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11 * cmPerPx}
          className="pointer-events-none select-none fill-muted-foreground" transform={`rotate(${-rot} ${cx} ${cy})`}
        >
          {label}
        </text>
      )}
    </g>
  )
}
```

- [ ] **Step 6: Implement `blueprint-canvas.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Rect, Rotation } from '@/lib/storage/floor-plan'
import {
  HANDLES, footprint, fromFootprint, moveRect, outlineSegments, overlappingKeys, planBounds,
  rectFromDrag, resizeRect, type Handle,
} from '@/lib/storage/geometry'
import {
  defaultRect, listShapes, sameRef, shapeKey, shelfRect,
  type DrawTool, type EditorDoc, type ShapePatch, type ShapeRef, type Tool,
} from './editor-state'
import { isTypingTarget } from './use-blueprint-editor'
import { ItemShape, ShelfShape } from './shapes'
import type { ZoneStyle } from './zone-colors'

interface ViewBox { x: number; y: number; w: number; h: number }
interface Point { x: number; y: number }

type Gesture =
  | { kind: 'pan'; client: Point; view: ViewBox }
  | { kind: 'draw'; start: Point; current: Point; free: boolean }
  | { kind: 'move'; ref: ShapeRef; start: Point; rect: Rect; moved: boolean }
  | { kind: 'resize'; ref: ShapeRef; handle: Handle; rect: Rect; rot: Rotation; moved: boolean }

export interface BlueprintCanvasProps {
  doc: EditorDoc
  mode: 'view' | 'edit'
  tool: Tool
  selected: ShapeRef | null
  zones: Map<string, ZoneStyle>
  highlightShelfKey?: string | null
  /** Bump to frame everything again. */
  fitToken: number
  onSelect: (ref: ShapeRef | null) => void
  onCheckpoint: () => void
  onPatch: (ref: ShapeRef, patch: ShapePatch) => void
  onAdd: (shape: DrawTool, rect: Rect) => void
}

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
}

const svgRect = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.d })

function handlePoint(r: Rect, h: Handle): Point {
  return {
    x: h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2,
    y: h.includes('n') ? r.y : h.includes('s') ? r.y + r.d : r.y + r.d / 2,
  }
}

export function BlueprintCanvas({
  doc, mode, tool, selected, zones, highlightShelfKey, fitToken, onSelect, onCheckpoint, onPatch, onAdd,
}: BlueprintCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: 1000, h: 700 })
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [draft, setDraft] = useState<Rect | null>(null)
  const [activeRef, setActiveRef] = useState<ShapeRef | null>(null)

  const shapes = useMemo(() => listShapes(doc), [doc])
  const overlaps = useMemo(
    () => overlappingKeys(shapes.filter((s) => s.blocks).map((s) => ({ key: shapeKey(s.ref), rect: s.fp }))),
    [shapes],
  )
  const outline = useMemo(() => outlineSegments(doc.plan.rooms), [doc.plan.rooms])
  const cmPerPx = Math.max(view.w / size.w, view.h / size.h)
  const px = (n: number) => n * cmPerPx

  const toPlan = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM?.()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  // Frame everything on open and whenever asked.
  useEffect(() => {
    const b = planBounds([...doc.plan.rooms, ...shapes.map((s) => s.fp)])
    setView({ x: b.x, y: b.y, w: b.w, h: b.d })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  // Wheel / pinch zoom about the pointer; non-passive so the page does not zoom.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toPlan(e.clientX, e.clientY)
      const k = Math.exp(e.deltaY * 0.0015)
      setView((v) => {
        const w = Math.min(Math.max(v.w * k, 100), 20000)
        const s = w / v.w
        return { x: p.x - (p.x - v.x) * s, y: p.y - (p.y - v.y) * s, w, h: v.h * s }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTypingTarget(e.target)) spaceDown.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const begin = (e: ReactPointerEvent, g: Gesture) => {
    gesture.current = g
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    const drawing = mode === 'edit' && tool !== 'select' && !spaceDown.current && e.button === 0
    if (!drawing) {
      if (!spaceDown.current && e.button === 0) onSelect(null)
      begin(e, { kind: 'pan', client: { x: e.clientX, y: e.clientY }, view })
      return
    }
    const p = toPlan(e.clientX, e.clientY)
    begin(e, { kind: 'draw', start: p, current: p, free: e.altKey })
    setDraft(rectFromDrag(p.x, p.y, p.x, p.y, e.altKey))
  }

  const onShapeDown = (ref: ShapeRef, rect: Rect) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || spaceDown.current) return
    if (mode === 'edit' && tool !== 'select') return // drawing over a shape still draws
    e.stopPropagation()
    onSelect(ref)
    if (mode === 'edit') begin(e, { kind: 'move', ref, start: toPlan(e.clientX, e.clientY), rect, moved: false })
  }

  const onHandleDown = (ref: ShapeRef, rect: Rect, rot: Rotation, handle: Handle) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    begin(e, { kind: 'resize', ref, handle, rect, rot, moved: false })
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      setView({ ...g.view, x: g.view.x - (e.clientX - g.client.x) * cmPerPx, y: g.view.y - (e.clientY - g.client.y) * cmPerPx })
      return
    }
    const p = toPlan(e.clientX, e.clientY)
    if (g.kind === 'draw') {
      g.current = p
      g.free = e.altKey
      setDraft(rectFromDrag(g.start.x, g.start.y, p.x, p.y, e.altKey))
      return
    }
    if (!g.moved) {
      onCheckpoint()
      g.moved = true
      setActiveRef(g.ref)
    }
    if (g.kind === 'move') {
      const next = moveRect(g.rect, p.x - g.start.x, p.y - g.start.y, e.altKey)
      onPatch(g.ref, { x: next.x, y: next.y })
      return
    }
    const next = fromFootprint(resizeRect(footprint({ ...g.rect, rot: g.rot }), g.handle, p.x, p.y, e.altKey), g.rot)
    onPatch(g.ref, next)
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    gesture.current = null
    setActiveRef(null)
    svgRef.current?.releasePointerCapture?.(e.pointerId)
    if (g?.kind === 'draw' && tool !== 'select') {
      const small = Math.abs(g.current.x - g.start.x) < 10 && Math.abs(g.current.y - g.start.y) < 10
      onAdd(tool, small ? defaultRect(tool, g.start, g.free) : rectFromDrag(g.start.x, g.start.y, g.current.x, g.current.y, g.free))
      setDraft(null)
    }
  }

  const selectedShape = shapes.find((s) => sameRef(s.ref, selected))
  const activeShape = shapes.find((s) => sameRef(s.ref, activeRef))
  const sizeLabelRect = draft ?? activeShape?.fp ?? null

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      <svg
        ref={svgRef}
        role="application"
        aria-label="Lab floor plan"
        className={cn('h-full w-full touch-none select-none', mode === 'edit' && tool !== 'select' ? 'cursor-crosshair' : 'cursor-grab')}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="bp-grid-minor" width={10} height={10} patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" className="stroke-border" strokeWidth={px(0.5)} />
          </pattern>
          <pattern id="bp-grid-major" width={100} height={100} patternUnits="userSpaceOnUse">
            {10 / cmPerPx >= 6 && <rect width={100} height={100} fill="url(#bp-grid-minor)" />}
            <path d="M 100 0 L 0 0 0 100" fill="none" className="stroke-border" strokeWidth={px(1)} />
          </pattern>
        </defs>
        <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="url(#bp-grid-major)" />

        {doc.plan.rooms.map((r) => (
          <rect key={r.id} {...svgRect(r)} className="fill-background" onPointerDown={onShapeDown({ kind: 'room', key: r.id }, r)} />
        ))}
        {outline.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-foreground" strokeWidth={3}
            strokeLinecap="square" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {doc.plan.items.map((it) => (
          <ItemShape key={it.id} item={it} cmPerPx={cmPerPx} onPointerDown={onShapeDown({ kind: 'item', key: it.id }, it)} />
        ))}
        {doc.shelves.map((s) => (
          <ShelfShape key={s.key} shelf={s} cmPerPx={cmPerPx} zones={zones} highlighted={s.key === highlightShelfKey}
            onPointerDown={onShapeDown({ kind: 'shelf', key: s.key }, shelfRect(s))} />
        ))}

        {shapes.filter((s) => overlaps.has(shapeKey(s.ref))).map((s) => (
          <rect key={`overlap-${shapeKey(s.ref)}`} {...svgRect(s.fp)} fill="none" stroke="#ef4444" strokeWidth={2}
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}

        {selectedShape && (
          <g>
            <rect {...svgRect(selectedShape.fp)} fill="none" className="stroke-foreground" strokeDasharray="4 3"
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {mode === 'edit' && HANDLES.map((h) => {
              const p = handlePoint(selectedShape.fp, h)
              const s = px(9)
              return (
                <rect key={h} data-testid={`handle-${h}`} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s}
                  className="fill-background stroke-foreground" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  style={{ cursor: HANDLE_CURSOR[h] }}
                  onPointerDown={onHandleDown(selectedShape.ref, selectedShape.rect, selectedShape.rot, h)} />
              )
            })}
          </g>
        )}

        {draft && (
          <rect {...svgRect(draft)} className="fill-foreground stroke-foreground" fillOpacity={0.08} strokeDasharray="4 3"
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
        {sizeLabelRect && (
          <text x={sizeLabelRect.x + sizeLabelRect.w / 2} y={sizeLabelRect.y - px(8)} textAnchor="middle"
            fontSize={px(12)} className="fill-foreground" pointerEvents="none">
            {sizeLabelRect.w} × {sizeLabelRect.d} cm
          </text>
        )}
      </svg>
      <ScaleBar cmPerPx={cmPerPx} rooms={doc.plan.rooms} />
    </div>
  )
}

function ScaleBar({ cmPerPx, rooms }: { cmPerPx: number; rooms: Rect[] }) {
  const cm = [50, 100, 200, 500, 1000, 2000, 5000].find((s) => s / cmPerPx >= 60) ?? 5000
  const room = rooms.length > 0 ? planBounds(rooms, 0) : null
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 text-[11px] text-muted-foreground">
      <div className="h-1.5 border-x border-b border-foreground" style={{ width: cm / cmPerPx }} />
      <div>
        {cm >= 100 ? `${cm / 100} m` : `${cm} cm`}
        {room ? ` · Room ${(room.w / 100).toFixed(2)} × ${(room.d / 100).toFixed(2)} m` : ''}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Implement `inspector.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FLOOR_ITEM_KINDS, FLOOR_ITEM_LABELS, MAX_COLUMNS, MAX_CUBBY_CAPACITY, MAX_PLAN_CM, MAX_ROWS, MIN_SIZE_CM,
  type AccessSide, type FloorItemKind,
} from '@/lib/storage/floor-plan'
import { findShape, type EditorDoc, type ShapePatch, type ShapeRef } from './editor-state'
import { ShelfFrontGrid } from './shelf-front-grid'
import type { ZoneStyle } from './zone-colors'

interface InspectorProps {
  doc: EditorDoc
  selected: ShapeRef | null
  zones: Map<string, ZoneStyle>
  onPatch: (ref: ShapeRef, patch: ShapePatch) => void
  onRotate: (ref: ShapeRef) => void
  onDelete: (ref: ShapeRef) => void
}

/** A number that commits on blur or Enter, so one edit is one undo step. */
function NumberField({ label, value, min, max, onCommit }: {
  label: string; value: number; min: number; max: number; onCommit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Number.parseInt(text, 10)
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n)
    else setText(String(value))
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={text} inputMode="numeric" aria-label={label} className="h-8"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

function TextField({ label, value, onCommit, transform, valid }: {
  label: string
  value: string
  onCommit: (v: string) => void
  transform?: (v: string) => string
  /** A value that fails this snaps back instead of committing. */
  valid?: (v: string) => boolean
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const next = transform ? transform(text) : text
    if (next !== value && (!valid || valid(next))) onCommit(next)
    else setText(value)
  }
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={text} aria-label={label} className="h-8"
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

export function Inspector({ doc, selected, zones, onPatch, onRotate, onDelete }: InspectorProps) {
  const found = findShape(doc, selected)
  if (!selected || !found) {
    return <p className="text-sm text-muted-foreground">Select a shape to edit it, or pick a tool on the left and drag on the plan.</p>
  }
  const { info, item, shelf } = found
  const patch = (p: ShapePatch) => onPatch(selected, p)
  const title = shelf ? `Shelf ${shelf.shelf_letter}` : item ? FLOOR_ITEM_LABELS[item.kind] : 'Room'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X (cm)" value={info.rect.x} min={0} max={MAX_PLAN_CM} onCommit={(x) => patch({ x })} />
        <NumberField label="Y (cm)" value={info.rect.y} min={0} max={MAX_PLAN_CM} onCommit={(y) => patch({ y })} />
        <NumberField label="Width (cm)" value={info.rect.w} min={MIN_SIZE_CM} max={MAX_PLAN_CM} onCommit={(w) => patch({ w })} />
        <NumberField label="Depth (cm)" value={info.rect.d} min={MIN_SIZE_CM} max={MAX_PLAN_CM} onCommit={(d) => patch({ d })} />
      </div>

      {item && (
        <div className="space-y-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Kind</span>
            <Select value={item.kind} onValueChange={(v) => patch({ kind: v as FloorItemKind })}>
              <SelectTrigger className="h-8" aria-label="Kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOOR_ITEM_KINDS.map((k) => <SelectItem key={k} value={k}>{FLOOR_ITEM_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <TextField label="Label" value={item.label ?? ''} onCommit={(label) => patch({ label })} />
        </div>
      )}

      {shelf && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Letter" value={shelf.shelf_letter} transform={(v) => v.trim().toUpperCase()}
              valid={(v) => /^[A-Z]{1,2}$/.test(v)} onCommit={(shelf_letter) => patch({ shelf_letter })} />
            <NumberField label="Samples per cubby" value={shelf.samples_per_position} min={1} max={MAX_CUBBY_CAPACITY}
              onCommit={(samples_per_position) => patch({ samples_per_position })} />
            <NumberField label="Rows" value={shelf.rows} min={1} max={MAX_ROWS} onCommit={(rows) => patch({ rows })} />
            <NumberField label="Columns" value={shelf.columns} min={1} max={MAX_COLUMNS} onCommit={(columns) => patch({ columns })} />
          </div>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Reached from</span>
            <Select value={shelf.access_side} onValueChange={(v) => patch({ access_side: v as AccessSide })}>
              <SelectTrigger className="h-8" aria-label="Reached from"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="front">Front only</SelectItem>
                <SelectItem value="both">Both sides</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground">
            {shelf.rows * shelf.columns} cubbies, {(shelf.rows * shelf.columns * shelf.samples_per_position).toLocaleString()} samples
          </p>
          <ShelfFrontGrid letter={shelf.shelf_letter} rows={shelf.rows} columns={shelf.columns}
            capacity={shelf.samples_per_position} cubbies={shelf.cubbies} zones={zones} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(selected)}>
          <Trash2 className="mr-1.5 h-4 w-4" />Delete
        </Button>
        {selected.kind !== 'room' && (
          <Button variant="outline" size="sm" onClick={() => onRotate(selected)}>
            <RotateCw className="mr-1.5 h-4 w-4" />Rotate 90°
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Implement `view-panel.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CubbySampleRow } from '@/lib/storage/cubby-samples'
import type { EditorDoc } from './editor-state'
import { ShelfFrontGrid } from './shelf-front-grid'
import type { ZoneStyle } from './zone-colors'

interface ViewPanelProps {
  laboratoryId: string
  doc: EditorDoc
  selectedShelfKey: string | null
  zones: Map<string, ZoneStyle>
  highlightCubbyId: string | null
  onFound: (shelfKey: string, cubbyId: string) => void
}

interface SearchMatch { sample_id: string; position_id: string; label: string }
interface CubbyContents { cubby: { id: string; code: string }; samples: CubbySampleRow[] }

export function ViewPanel({ laboratoryId, doc, selectedShelfKey, zones, highlightCubbyId, onFound }: ViewPanelProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [contents, setContents] = useState<CubbyContents | null>(null)
  const [loading, setLoading] = useState(false)
  const shelf = doc.shelves.find((s) => s.key === selectedShelfKey) ?? null

  const shelfOf = useCallback(
    (positionId: string) => doc.shelves.find((s) => s.cubbies.some((c) => c.id === positionId)) ?? null,
    [doc.shelves],
  )

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setMatches([]); return }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/laboratories/${laboratoryId}/storage/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const body = await res.json()
        setMatches(res.ok ? body.matches ?? [] : [])
      } catch {
        // aborted by the next keystroke
      }
    }, 250)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [query, laboratoryId])

  useEffect(() => {
    if (!highlightCubbyId) { setContents(null); return }
    let alive = true
    setLoading(true)
    fetch(`/api/laboratories/${laboratoryId}/storage/cubbies/${highlightCubbyId}`)
      .then(async (res) => { if (alive) setContents(res.ok ? await res.json() : null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [highlightCubbyId, laboratoryId])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8"
          placeholder="Find a sample: certificate, contract or ref" aria-label="Find a stored sample" />
      </div>

      {matches.length > 0 && (
        <ul className="divide-y border text-sm">
          {matches.map((m) => {
            const found = shelfOf(m.position_id)
            const code = found?.cubbies.find((c) => c.id === m.position_id)?.code ?? ''
            return (
              <li key={m.sample_id}>
                <button type="button" className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => found && onFound(found.key, m.position_id)}>
                  <span className="truncate">{m.label}</span>
                  <span className="shrink-0 text-muted-foreground">{code}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim().length >= 2 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground">No stored sample matches.</p>
      )}

      {shelf ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Shelf {shelf.shelf_letter}</h3>
          <ShelfFrontGrid letter={shelf.shelf_letter} rows={shelf.rows} columns={shelf.columns}
            capacity={shelf.samples_per_position} cubbies={shelf.cubbies} zones={zones}
            highlightCubbyId={highlightCubbyId} onCubbyClick={(c) => c && onFound(shelf.key, c.id)} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Click a shelf to see its cubbies.</p>
      )}

      {loading && <p className="text-xs text-muted-foreground">Loading cubby…</p>}
      {contents && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{contents.cubby.code}</h3>
          {contents.samples.length === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="divide-y border text-sm">
              {contents.samples.map((s) => (
                <li key={s.id} className="px-2 py-1.5">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {[s.client || null, s.contract ? `#${s.contract}` : null].filter(Boolean).join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Implement `tool-palette.tsx`**

```tsx
'use client'

import { AppWindow, Archive, Box, DoorOpen, Grid3x3, MousePointer2, RectangleHorizontal, Square, Table } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tool } from './editor-state'

const TOOLS: Array<{ tool: Tool; label: string; icon: LucideIcon }> = [
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'room', label: 'Room', icon: Square },
  { tool: 'shelf', label: 'Shelf', icon: Grid3x3 },
  { tool: 'bench', label: 'Bench', icon: RectangleHorizontal },
  { tool: 'table', label: 'Table', icon: Table },
  { tool: 'cabinet', label: 'Cabinet', icon: Archive },
  { tool: 'equipment', label: 'Equipment', icon: Box },
  { tool: 'door', label: 'Door', icon: DoorOpen },
  { tool: 'window', label: 'Window', icon: AppWindow },
]

export function ToolPalette({ tool, onTool }: { tool: Tool; onTool: (t: Tool) => void }) {
  return (
    <nav aria-label="Drawing tools" className="flex w-20 shrink-0 flex-col gap-1 border-r p-2">
      {TOOLS.map(({ tool: t, label, icon: Icon }) => (
        <button key={t} type="button" aria-pressed={tool === t} onClick={() => onTool(t)}
          className={cn('flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] hover:bg-muted',
            tool === t && 'bg-muted font-medium')}>
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 10: Type-check and commit**

Run: `npx tsc --noEmit` — Expected: no errors in `src/components/storage/blueprint/`.
Run: `npx vitest run src/components/storage/blueprint` — Expected: PASS.

```bash
git add src/components/storage/blueprint/
git commit -m "feat(storage): blueprint canvas, shelf front grid, inspector and view panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Workspace and overlay

**Files:**
- Create: `src/components/storage/blueprint/storage-workspace.tsx`
- Create: `src/components/storage/blueprint/storage-overlay.tsx`
- Test: `src/components/storage/blueprint/storage-overlay.test.tsx`

**Interfaces:**
- Consumes: everything in Tasks 4–8; `toast` from `@/hooks/use-toast`; `AlertDialog*` from `@/components/ui/alert-dialog`.
- Produces: `<StorageWorkspace laboratoryId initialMode? onDirtyChange? />`; `<StorageOverlay laboratoryId labName initialMode? onClose />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StorageOverlay } from './storage-overlay'

// jsdom 25 has no PointerEvent: fireEvent.pointerDown would send a bare Event
// with no `button`, and the canvas ignores anything but the primary button.
if (!('PointerEvent' in window)) {
  class TestPointerEvent extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent
}

const layout = {
  laboratory: { id: 'lab', name: 'Santos', floor_plan: { version: 1, rooms: [], items: [] }, storage_capacity: 84 },
  shelves: [{
    id: 's-a', shelf_letter: 'A', rows: 1, columns: 2, samples_per_position: 42, x_cm: 50, y_cm: 50,
    width_cm: 60, depth_cm: 40, rot: 0, access_side: 'front', company_id: null,
    cubbies: [
      { id: 'p1', row: 1, column: 1, code: 'A-A1', capacity: 42, occupied: 3, company_id: null },
      { id: 'p2', row: 1, column: 2, code: 'A-A2', capacity: 42, occupied: 0, company_id: null },
    ],
  }],
  companies: [],
  can_edit: true,
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      return json({ error: 'Some changes would remove space that still holds samples', conflicts: ['Cubby A-A1 holds 3 samples and is outside the new grid'] }, 409)
    }
    return json(layout)
  }))
})

async function openAndEditRows() {
  const onClose = vi.fn()
  render(<StorageOverlay laboratoryId="lab" labName="Santos" onClose={onClose} />)
  await screen.findByTestId('shelf-A')
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.pointerDown(screen.getByTestId('shelf-A'), { button: 0, pointerId: 1 })
  fireEvent.pointerUp(screen.getByRole('application'), { pointerId: 1 })
  const rows = await screen.findByLabelText('Columns')
  fireEvent.change(rows, { target: { value: '1' } })
  fireEvent.blur(rows)
  return onClose
}

describe('StorageOverlay', () => {
  it('shows every conflict when a save would drop samples', async () => {
    await openAndEditRows()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cubby A-A1 holds 3 samples')
    // One GET only: the workspace must not refetch on every render.
    const gets = vi.mocked(fetch).mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method)
    expect(gets).toHaveLength(1)
  })

  it('asks before closing with unsaved changes', async () => {
    const onClose = await openAndEditRows()
    // Dispatched on document so it bubbles to window, as a real key press does.
    fireEvent.keyDown(document, { key: 'Escape' }) // first Escape only deselects the shelf
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/storage/blueprint/storage-overlay.test.tsx`
Expected: FAIL — cannot resolve `./storage-overlay`.

- [ ] **Step 3: Implement `storage-workspace.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Maximize, Pencil, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import type { StorageLayout } from '@/lib/storage/layout'
import { fromLayout, toSavePayload, type ShapeRef } from './editor-state'
import { useBlueprintEditor, useEditorKeyboard } from './use-blueprint-editor'
import { BlueprintCanvas } from './blueprint-canvas'
import { Inspector } from './inspector'
import { ToolPalette } from './tool-palette'
import { ViewPanel } from './view-panel'
import { zoneStyles } from './zone-colors'

interface StorageWorkspaceProps {
  laboratoryId: string
  initialMode?: 'view' | 'edit'
  onDirtyChange?: (dirty: boolean) => void
}

export function StorageWorkspace({ laboratoryId, initialMode = 'view', onDirtyChange }: StorageWorkspaceProps) {
  const [layout, setLayout] = useState<StorageLayout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<{ message: string; items: string[] } | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [highlight, setHighlight] = useState<{ shelfKey: string; cubbyId: string } | null>(null)
  const { state, actions } = useBlueprintEditor()

  const load = useCallback(async () => {
    setLoadError(null)
    const res = await fetch(`/api/laboratories/${laboratoryId}/storage`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(body.error || 'Failed to load storage'); return }
    setLayout(body)
    actions.load(fromLayout(body))
    setFitToken((t) => t + 1)
    if (initialMode === 'edit' && body.can_edit) setMode('edit')
  }, [laboratoryId, initialMode, actions])

  useEffect(() => { load() }, [load])
  useEffect(() => { onDirtyChange?.(state.dirty) }, [state.dirty, onDirtyChange])
  useEditorKeyboard(mode === 'edit', state.selected, actions)

  const zones = useMemo(() => zoneStyles((layout?.companies ?? []).map((c) => c.id)), [layout])

  const select = (ref: ShapeRef | null) => {
    actions.select(ref)
    if (!ref || ref.kind !== 'shelf' || ref.key !== highlight?.shelfKey) setHighlight(null)
  }

  const save = async () => {
    setSaving(true)
    setConflicts(null)
    try {
      const res = await fetch(`/api/laboratories/${laboratoryId}/storage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSavePayload(state.doc)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setConflicts({ message: body.error || 'Failed to save the floor plan', items: body.conflicts ?? [] })
        return
      }
      setLayout(body)
      actions.saved(fromLayout(body))
      toast({ title: 'Floor plan saved' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="p-6 text-sm">
        <p className="text-red-600">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>Try again</Button>
      </div>
    )
  }
  if (!layout) return <div className="p-6 text-sm text-muted-foreground">Loading storage…</div>

  const selectedShelfKey = state.selected?.kind === 'shelf' ? state.selected.key : null
  const companiesInUse = layout.companies

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="text-xs text-muted-foreground">
          {layout.shelves.length} shelves · {layout.laboratory.storage_capacity.toLocaleString()} samples capacity
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Fit to screen" onClick={() => setFitToken((t) => t + 1)}>
            <Maximize className="h-4 w-4" />
          </Button>
          {mode === 'edit' && (
            <>
              <Button variant="ghost" size="sm" aria-label="Undo" disabled={state.past.length === 0} onClick={actions.undo}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Redo" disabled={state.future.length === 0} onClick={actions.redo}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </>
          )}
          {layout.can_edit && (
            mode === 'view' ? (
              <Button variant="outline" size="sm" onClick={() => setMode('edit')}>
                <Pencil className="mr-1.5 h-4 w-4" />Edit
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={state.dirty}
                title={state.dirty ? 'Save or undo your changes first' : undefined}
                onClick={() => { setMode('view'); actions.setTool('select') }}>
                <Eye className="mr-1.5 h-4 w-4" />View
              </Button>
            )
          )}
          {mode === 'edit' && (
            <Button size="sm" disabled={!state.dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
          )}
        </div>
      </div>

      {conflicts && (
        <div role="alert" className="border-b border-red-500/40 bg-red-500/5 px-4 py-2 text-sm">
          <p className="font-medium text-red-600">{conflicts.message}</p>
          {conflicts.items.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-600">
              {conflicts.items.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {mode === 'edit' && <ToolPalette tool={state.tool} onTool={actions.setTool} />}
        <div className="relative min-w-0 flex-1">
          <BlueprintCanvas
            doc={state.doc} mode={mode} tool={state.tool} selected={state.selected} zones={zones}
            highlightShelfKey={highlight?.shelfKey ?? null} fitToken={fitToken}
            onSelect={select} onCheckpoint={actions.checkpoint}
            onPatch={(ref, patch) => actions.patch(ref, patch, false)} onAdd={actions.add}
          />
          {mode === 'edit' && state.doc.plan.rooms.length === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border bg-background px-3 py-1.5 text-xs">
              Draw the room first: pick Room and drag out its walls.
            </div>
          )}
          {companiesInUse.length > 0 && (
            <ul className="absolute bottom-3 right-3 space-y-1 rounded-md border bg-background p-2 text-[11px]">
              {companiesInUse.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: zones.get(c.id)?.color }} />
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-y-auto border-l p-4">
          {mode === 'edit' ? (
            <Inspector doc={state.doc} selected={state.selected} zones={zones}
              onPatch={(ref, patch) => actions.patch(ref, patch, true)} onRotate={actions.rotate} onDelete={actions.remove} />
          ) : (
            <ViewPanel laboratoryId={laboratoryId} doc={state.doc} selectedShelfKey={selectedShelfKey} zones={zones}
              highlightCubbyId={highlight?.cubbyId ?? null}
              onFound={(shelfKey, cubbyId) => { actions.select({ kind: 'shelf', key: shelfKey }); setHighlight({ shelfKey, cubbyId }) }} />
          )}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement `storage-overlay.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StorageWorkspace } from './storage-workspace'

interface StorageOverlayProps {
  laboratoryId: string
  labName: string
  initialMode?: 'view' | 'edit'
  onClose: () => void
}

/** Full-screen storage for one lab. Escape or X closes; unsaved edits ask first. */
export function StorageOverlay({ laboratoryId, labName, initialMode, onClose }: StorageOverlayProps) {
  const [dirty, setDirty] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const requestClose = () => (dirty ? setConfirming(true) : onClose())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || confirming) return
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Storage · {labName}</h2>
        <Button variant="ghost" size="icon" aria-label="Close storage" onClick={requestClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <StorageWorkspace laboratoryId={laboratoryId} initialMode={initialMode} onDirtyChange={setDirty} />
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The floor plan has changes that are not saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

(The overlay's Escape listener re-registers every render on purpose so it always sees the current `dirty`. It sits on `window`; the editor's sits on `document`, which the event reaches first, and calls `preventDefault()` when Escape only deselects — so registration order never matters.)

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/storage/blueprint/storage-overlay.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/storage/blueprint/storage-workspace.tsx src/components/storage/blueprint/storage-overlay.tsx src/components/storage/blueprint/storage-overlay.test.tsx
git commit -m "feat(storage): full-screen storage workspace with save conflicts and unsaved guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Wire the pages, retire the old storage code, verify, push

**Files:**
- Modify: `src/app/laboratories/page.tsx`
- Modify: `src/app/samples/storage/page.tsx`
- Modify: `src/app/api/laboratories/[id]/route.ts:138-142`
- Delete: the files listed under "Deleted" in File Structure

**Interfaces:**
- Consumes: `StorageOverlay`, `StorageWorkspace` (Task 9).

- [ ] **Step 1: Laboratories page — one-step creation, overlay for storage**

In `src/app/laboratories/page.tsx`:

1. Imports: replace `import { LabStorageManagement } from '@/components/storage/lab-storage-management'` with `import { StorageOverlay } from '@/components/storage/blueprint/storage-overlay'`.
2. Delete the `ShelfData` and `Obstacle` interfaces; the state `labCreationStep`, `createdLabId`, `shelves`, `obstacles`, `placementMode`, `selectedObstacleType`; and the functions `calculateTotalCapacity`, `handleAddShelf`, `handleUpdateShelf`, `handleRemoveShelf`, `handleAddObstacle`, `handleRemoveObstacle`, `handleUpdateObstacle`, `handleGridClick`, `getObstacleIcon`, `handleNextStep`, `handlePreviousStep`, `handleFinishCreation`.
3. Add state `const [storageMode, setStorageMode] = useState<'view' | 'edit'>('view')` and this handler in place of `handleNextStep`:

```tsx
  const resetNewLab = () => setNewLab({
    name: '', address: '', city: '', state: '', zip_code: '', vat_number: '', country: '', type: 'lab',
    contact_email: '', contact_phone: '', admin_email: '', admin_name: '', supported_origins: [],
    is_3rd_party: false, fee_per_sample: undefined, fee_currency: 'USD', billing_basis: 'approved_only',
    type_sample_prefix: '', type_sample_sequence_start: 1,
  })

  // Create the lab, invite its director, then open its storage to draw the room.
  const handleCreateLab = async () => {
    if (!newLab.name || !newLab.address || !newLab.city || !newLab.state || !newLab.country) {
      alert('Please fill in laboratory name, address, city, state, and country')
      return
    }
    const location = [newLab.address, newLab.city, newLab.state, newLab.zip_code].filter(Boolean).join(', ')
    try {
      const response = await fetch('/api/laboratories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLab.name,
          location,
          country: newLab.country,
          zip_code: newLab.zip_code || null,
          vat_number: newLab.vat_number || null,
          type: newLab.type,
          storage_capacity: 0,
          contact_email: newLab.contact_email,
          contact_phone: newLab.contact_phone,
          supported_origins: newLab.supported_origins.length > 0 ? newLab.supported_origins : null,
          is_3rd_party: newLab.is_3rd_party,
          fee_per_sample: newLab.is_3rd_party ? newLab.fee_per_sample : null,
          fee_currency: newLab.is_3rd_party ? newLab.fee_currency : null,
          billing_basis: newLab.is_3rd_party ? newLab.billing_basis : null,
          type_sample_prefix: newLab.type_sample_prefix || null,
          type_sample_sequence_start: newLab.type_sample_sequence_start || 1,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(`Failed to create laboratory: ${data.error}`)
        return
      }
      if (newLab.admin_email && newLab.admin_name) {
        try {
          await fetch(`/api/laboratories/${data.laboratory.id}/personnel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: newLab.admin_email, full_name: newLab.admin_name, qc_role: 'lab_director' }),
          })
        } catch (error) {
          console.error('Error creating lab admin:', error)
        }
      }
      setAddLabDialogOpen(false)
      resetNewLab()
      await loadLaboratories()
      setStorageMode('edit')
      setViewingStorage(data.laboratory)
    } catch (error) {
      console.error('Error creating laboratory:', error)
      alert('Failed to create laboratory')
    }
  }
```

4. In the Add Laboratory dialog: `DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"`; title `Add New Laboratory`; delete the progress-indicator `<div className="flex gap-2 mb-4">…</div>`; unwrap the step-1 block (remove `{labCreationStep === 1 && (` and its closing `)}`); change the step-1 footer button to `<Button onClick={handleCreateLab}>Create Laboratory</Button>`; delete the whole `{labCreationStep === 2 && (…)}` and `{labCreationStep === 3 && (…)}` blocks.
5. "Manage Storage" button: `onClick={() => { setStorageMode('view'); setViewingStorage(lab) }}`.
6. Replace the `{/* Storage Management Dialog */}` block with:

```tsx
        {viewingStorage && (
          <StorageOverlay
            laboratoryId={viewingStorage.id}
            labName={viewingStorage.name}
            initialMode={storageMode}
            onClose={() => { setViewingStorage(null); loadLaboratories() }}
          />
        )}
```

7. Remove `clients` state and `loadClients` if nothing else uses them (`grep -n "clients\b\|loadClients" src/app/laboratories/page.tsx`), and every import ESLint reports unused: `npx eslint src/app/laboratories/page.tsx`.

Check: `wc -l src/app/laboratories/page.tsx` — expected well under 1990 (about 1400).

- [ ] **Step 2: Storage page embeds the workspace**

In `src/app/samples/storage/page.tsx` replace the import of `StorageLayoutView` with `import { StorageWorkspace } from '@/components/storage/blueprint/storage-workspace'` and the block

```tsx
            {selectedLabId && (
              <StorageLayoutView
                laboratoryId={selectedLabId}
              />
            )}
```

with

```tsx
            {selectedLabId && (
              <div className="h-[calc(100vh-260px)] min-h-[560px] overflow-hidden border">
                <StorageWorkspace key={selectedLabId} laboratoryId={selectedLabId} />
              </div>
            )}
```

- [ ] **Step 3: Lab PATCH drops the entrance fields**

In `src/app/api/laboratories/[id]/route.ts` remove `'entrance_x_position',` and `'entrance_y_position',` from `allowedFields`.

- [ ] **Step 4: Delete the old storage code**

```bash
git rm src/components/storage/storage-layout-view.tsx src/components/storage/lab-storage-management.tsx \
  src/components/storage/shelf-card.tsx src/components/storage/shelf-detail-dialog.tsx \
  src/components/storage/shelf-assignment-dialog.tsx src/components/storage/position-assignment-dialog.tsx \
  src/components/storage/position-grid.tsx src/components/storage/position-cell.tsx \
  src/components/storage/client-storage-view.tsx src/app/laboratories/page_ENHANCED.tsx
git rm -r "src/app/api/laboratories/[id]/storage-layout" "src/app/api/laboratories/[id]/shelves" \
  "src/app/api/laboratories/[id]/positions" "src/app/api/samples/[id]/assign-storage" \
  "src/app/api/samples/[id]/suggested-positions" src/app/api/clients/me/storage-layout src/app/api/clients/me/storage-view
```

Check nothing still points at them:

```bash
grep -rnE "storage-layout-view|lab-storage-management|shelf-card|shelf-detail-dialog|shelf-assignment-dialog|position-assignment-dialog|position-grid|position-cell|client-storage-view|/storage-layout|/shelves|assign-storage|suggested-positions|clients/me/storage|get_shelf_utilization|generate_storage_positions_for_shelf|entrance_x_position" src
```
Expected: matches only in `src/lib/database.types.ts` (generated; left as is).

- [ ] **Step 5: No SAN number on any new surface**

```bash
grep -rn "tracking_number" src/components/storage src/lib/storage "src/app/api/laboratories/[id]/storage"
```
Expected: only the test assertion in `src/lib/storage/cubby-samples.test.ts`.

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit` — Expected: exit 0.
Run: `npx vitest run` — Expected: all suites pass (report the count; if anything outside storage fails, check it fails on `main` too before calling it unrelated).
Run: `npm run build` — Expected: build succeeds (catches non-handler exports in route files).

- [ ] **Step 7: Commit**

```bash
git add -A src/app/laboratories/page.tsx src/app/samples/storage/page.tsx "src/app/api/laboratories/[id]/route.ts"
git commit -m "feat(storage): labs open the blueprint; retire the shelf-card floor plan

Lab creation is one step and opens the new lab's storage to draw the room.
The old storage components and routes joined the dropped clients table and
returned the SAN number; nothing calls them any more.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Push after the migrations are confirmed**

Ask Daniel to confirm the preflight was reviewed and the schema migration, the functions migration and the scenario script all ran clean. Only then:

```bash
git push origin HEAD:main
```

Then tell Daniel what to check in the browser on Production: Laboratories → Manage Storage opens full screen; existing shelves (if any) sit in a row; draw the room, a door and a bench, move and resize a shelf, rotate it, change its grid, Save; reopen and see it kept; /samples/storage shows the same plan read-only; search finds a stored sample by certificate number.
