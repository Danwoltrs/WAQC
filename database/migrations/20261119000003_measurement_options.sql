-- 20261119000003_measurement_options.sql
--
-- The lists a grader picks from when recording how a lot was measured:
--   humidity_method   the method or meter the moisture was read with, and
--                     whether that method is an ISO one;
--   density_type      which density the figure is.
--
-- The lab adds to both lists itself. Two humidity methods are seeded: the two
-- "standards" every quality already names (quality parameter
-- moisture_standard = coffee_industry | iso_6673), so a lot's method can start
-- from its quality's. No density type is seeded: the lab names its own.
--
-- A lot stores the NAME it was measured with (green_bean_data.moisture_method,
-- .moisture_method_iso, .density_type), not a link to this table: renaming or
-- retiring an entry never changes a certificate already issued.
--
-- Not shared with sys. Safe to run twice.

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.qc_measurement_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('humidity_method', 'density_type')),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  -- Only meaningful for a humidity method: is it an ISO method?
  is_iso      boolean NOT NULL DEFAULT false,
  -- The quality parameter value this entry stands for (moisture_standard), if any.
  spec_key    text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS qc_measurement_options_kind_name_key
  ON public.qc_measurement_options (kind, lower(btrim(name)));

ALTER TABLE public.qc_measurement_options ENABLE ROW LEVEL SECURITY;

-- Lab staff read the lists and keep them; nobody else sees the table.
DROP POLICY IF EXISTS qc_measurement_options_staff_select ON public.qc_measurement_options;
CREATE POLICY qc_measurement_options_staff_select ON public.qc_measurement_options
  FOR SELECT TO authenticated
  USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS qc_measurement_options_staff_insert ON public.qc_measurement_options;
CREATE POLICY qc_measurement_options_staff_insert ON public.qc_measurement_options
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS qc_measurement_options_staff_update ON public.qc_measurement_options;
CREATE POLICY qc_measurement_options_staff_update ON public.qc_measurement_options
  FOR UPDATE TO authenticated
  USING ((SELECT public.waqc_is_staff()))
  WITH CHECK ((SELECT public.waqc_is_staff()));

-- No DELETE policy: an entry is retired (is_active = false), never deleted.

GRANT SELECT, INSERT, UPDATE ON public.qc_measurement_options TO authenticated;
GRANT ALL ON public.qc_measurement_options TO service_role;

INSERT INTO public.qc_measurement_options (kind, name, is_iso, spec_key, sort_order)
VALUES
  ('humidity_method', 'Coffee industry', false, 'coffee_industry', 10),
  ('humidity_method', 'ISO 6673',        true,  'iso_6673',        20)
ON CONFLICT (kind, lower(btrim(name))) DO NOTHING;

-- Checks: abort the whole migration if any of this did not hold.
DO $$
DECLARE
  v_count INT;
BEGIN
  v_count := (SELECT count(*) FROM public.qc_measurement_options WHERE kind = 'humidity_method' AND is_active);
  IF v_count < 2 THEN
    RAISE EXCEPTION 'expected the two seeded humidity methods, found %', v_count;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.qc_measurement_options'::regclass) THEN
    RAISE EXCEPTION 'row level security is off on qc_measurement_options';
  END IF;
END $$;

COMMIT;

-- What is on the lists now.
SELECT kind, name, is_iso, is_active FROM public.qc_measurement_options ORDER BY kind, sort_order, name;
