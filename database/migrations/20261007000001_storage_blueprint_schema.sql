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
  -- What the shelf covers stays on the plan. Turned 90/270 degrees it covers
  -- depth x width about the same centre, so against a wall its stored corner
  -- (the unrotated top-left) can be negative. Mirrors footprintOrigin() in
  -- src/lib/storage/floor-plan.ts.
  ADD CONSTRAINT lab_shelves_place_valid CHECK (
    CASE WHEN rot IN (90, 270)
         THEN x_cm + ceil((width_cm - depth_cm) / 2.0) BETWEEN 0 AND 10000
          AND y_cm + ceil((depth_cm - width_cm) / 2.0) BETWEEN 0 AND 10000
         ELSE x_cm BETWEEN 0 AND 10000 AND y_cm BETWEEN 0 AND 10000
    END),
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
