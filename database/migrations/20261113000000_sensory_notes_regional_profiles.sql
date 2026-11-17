-- Migration 20261113000000: sensory notes + regional profiles
--
-- regional_profiles: named sets of expected sensory notes per origin/region.
--   notes is a jsonb array. Staff read and write; portal clients read through
--   a service-role API route, so there is no client policy. updated_at is set
--   by the API (no trigger).
-- cupping_scores.sensory: per-cupper sensory notes (nullable jsonb).
-- quality_assessments.sensory_resolution: frozen sensory resolution (nullable jsonb).
--
-- Requires public.waqc_is_staff() (20261014000001).
-- Paste-safe for the Supabase editor: plain statements, no SELECT ... INTO.

BEGIN;

CREATE TABLE IF NOT EXISTS public.regional_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  origin      text,
  region      text,
  notes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regional_profiles_notes_is_array CHECK (jsonb_typeof(notes) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS regional_profiles_name_lower_uniq
  ON public.regional_profiles (lower(name));

ALTER TABLE public.regional_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regional_profiles_staff_select ON public.regional_profiles;
CREATE POLICY regional_profiles_staff_select ON public.regional_profiles
  FOR SELECT TO authenticated USING ((SELECT public.waqc_is_staff()));

DROP POLICY IF EXISTS regional_profiles_staff_write ON public.regional_profiles;
CREATE POLICY regional_profiles_staff_write ON public.regional_profiles
  FOR ALL TO authenticated
  USING ((SELECT public.waqc_is_staff()))
  WITH CHECK ((SELECT public.waqc_is_staff()));

ALTER TABLE public.cupping_scores ADD COLUMN IF NOT EXISTS sensory jsonb;
ALTER TABLE public.quality_assessments ADD COLUMN IF NOT EXISTS sensory_resolution jsonb;

COMMENT ON TABLE public.regional_profiles IS
  'Regional sensory profiles: named sets of expected notes per origin/region. Staff read/write; portal clients read through a service-role route. updated_at is set by the API.';
COMMENT ON COLUMN public.regional_profiles.notes IS
  'jsonb array of sensory notes for the profile.';
COMMENT ON COLUMN public.cupping_scores.sensory IS
  'Per-cupper sensory notes for this cupping score row (nullable jsonb).';
COMMENT ON COLUMN public.quality_assessments.sensory_resolution IS
  'Frozen sensory resolution across the panel, written at grading finalize (nullable jsonb).';

COMMIT;

-- Verification (run separately):
-- SELECT count(*) AS profiles FROM public.regional_profiles;  -- expect 0
-- SELECT table_name, column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'cupping_scores' AND column_name = 'sensory')
--      OR (table_name = 'quality_assessments' AND column_name = 'sensory_resolution'));  -- expect 2 rows, jsonb
-- SELECT policyname, cmd, roles FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'regional_profiles' ORDER BY policyname;  -- expect staff_select, staff_write
