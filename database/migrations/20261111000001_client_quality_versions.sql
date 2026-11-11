-- Migration 20261111000001: versioned client quality specifications
--
-- Every client quality gets a history of dated spec versions
-- (client_quality_versions). A version is a jsonb snapshot of the quality's
-- private template copy (the columns listed in
-- src/lib/quality-spec/spec-columns.ts) plus the client quality's own fields.
-- A lot pins the version it was graded against (samples.spec_version_id), so a
-- later change never re-judges a lot that has already started.
--
-- Pending version = not applied and not cancelled. Only the highest version
-- can be pending: a client change is refused while one exists. A Wolthers
-- change cancels it while its date is still ahead; one already due (the daily
-- apply has not reached it) is marked applied instead, never cancelled, since
-- lots may already be pinned to it.
--
-- Functions (the three write functions are service role only):
--   client_quality_spec_snapshot(uuid) -> jsonb    read-only, STABLE
--   record_client_quality_version(cq, source, user, note) -> uuid
--       Wolthers (or the migration) changed the template: cancel a pending
--       version dated after today; mark a pending version already due
--       (effective_from <= today) applied, with no template write; then
--       snapshot the current spec as a new version effective today, which
--       supersedes the due one from today on.
--       Dedupe: when the snapshot equals the latest applied, non-cancelled
--       version's spec, nothing changed: return that version's id and touch
--       nothing (no cancel, no mark-applied, no insert). Staff routes call it
--       on every save that names a spec field, so a re-save after a failed
--       call heals and a no-op save adds no version and never cancels a
--       client's scheduled change.
--   insert_client_quality_version(cq, base_version, parameters, effective_from, user, note) -> uuid
--       A client change to template.parameters. Errors, in this order, with
--       the bare code as the message: past_date, pending_change, stale_base
--       (then invalid_parameters). Effective today = applied at once.
--   apply_client_quality_version(version) -> void
--       Write the version's parameters to the private template copy. No-op if
--       already applied or cancelled. Raises not_due before its date and
--       not_a_private_copy on a shared template.
-- created_by / cancelled_by point at auth.users, not profiles: client portal
-- users have no profiles row (20261109000000), like
-- sample_recipients.responded_by (20261109000001).
-- Dates are calendar dates in America/Sao_Paulo.
--
-- Before applying: 20261111000000 (private copies) is applied and its check
-- returned shared_left = 0, and public.waqc_is_staff() exists
-- (20261014000001).
--
-- Backfill: every client quality with a template gets version 1, effective
-- 2000-01-01. Lots already started (a quality_assessments, certificates or
-- cupping_scores row on the lot or on its lab unit, i.e. the row named by
-- lab_source_sample_id) are pinned to that version 1. Lots not yet started
-- stay unpinned and are pinned when grading starts.
--
-- Paste-safe for the Supabase editor.

BEGIN;
-- Creating the table takes a SHARE ROW EXCLUSIVE lock on auth.users (its two
-- foreign keys) and adding the sample columns an ACCESS EXCLUSIVE lock on
-- samples. Give up after 3 s instead of queueing behind live traffic; on
-- "lock timeout" nothing is kept and the paste is safe to run again.
SET LOCAL lock_timeout = '3s';

-- 1. Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_quality_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_quality_id uuid NOT NULL REFERENCES public.client_qualities(id) ON DELETE CASCADE,
  version_no        integer NOT NULL,
  effective_from    date NOT NULL,
  spec              jsonb NOT NULL,
  source            text NOT NULL CHECK (source IN ('migration', 'client', 'wolthers')),
  note              text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  applied_at        timestamptz,
  notified_at       timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_note       text,
  UNIQUE (client_quality_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_client_quality_versions_effective
  ON public.client_quality_versions (client_quality_id, effective_from);

ALTER TABLE public.client_quality_versions ENABLE ROW LEVEL SECURITY;

-- Staff read; no write policies: every write goes through the service role.
DROP POLICY IF EXISTS client_quality_versions_staff_select ON public.client_quality_versions;
CREATE POLICY client_quality_versions_staff_select ON public.client_quality_versions
  FOR SELECT TO authenticated USING ((SELECT public.waqc_is_staff()));

COMMENT ON TABLE public.client_quality_versions IS
  'Dated versions of a client quality specification. spec = snapshot of the private template copy plus the client quality fields. Written only by the service role through the *_client_quality_version functions.';

-- 2. Sample columns ------------------------------------------------------------
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS spec_version_id uuid REFERENCES public.client_quality_versions(id);
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS contract_date date;

COMMENT ON COLUMN public.samples.spec_version_id IS
  'The client quality spec version this lot is judged against. Set when grading starts; NULL = not started yet.';
COMMENT ON COLUMN public.samples.contract_date IS
  'Contract date of the lot (calendar date).';

-- 3. Snapshot ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_quality_spec_snapshot(p uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'template', jsonb_build_object(
      'parameters', COALESCE(t.parameters, '{}'::jsonb),
      'methodology', t.methodology,
      'cva_min_score', t.cva_min_score,
      'requires_descriptors', t.requires_descriptors,
      'cva_score_spread_max', t.cva_score_spread_max,
      'cupping_scale_min', t.cupping_scale_min,
      'cupping_scale_max', t.cupping_scale_max,
      'cupping_discrepancy_threshold', t.cupping_discrepancy_threshold,
      'defect_thresholds_primary', t.defect_thresholds_primary,
      'defect_thresholds_secondary', t.defect_thresholds_secondary,
      'max_taints_allowed', t.max_taints_allowed,
      'max_faults_allowed', t.max_faults_allowed,
      'screen_size_requirements', t.screen_size_requirements
    ),
    -- No COALESCE: a NULL custom_parameters stays null, so readers that fall
    -- back to the template parameters on null keep doing so (R19).
    'custom_parameters', cq.custom_parameters,
    'cups_per_sample', cq.cups_per_sample,
    'discrepancy_threshold', cq.discrepancy_threshold
  )
  FROM public.client_qualities cq
  JOIN public.quality_templates t ON t.id = cq.template_id
  WHERE cq.id = p
$$;

-- 4. Apply a version to the private template copy -----------------------------
-- These bodies assign with := only. The Supabase editor takes the variable
-- after a select-and-assign keyword for a new table and appends an ENABLE RLS
-- for it, which fails.
CREATE OR REPLACE FUNCTION public.apply_client_quality_version(p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cq_id            uuid;
  v_ver              public.client_quality_versions%ROWTYPE;
  v_template_id      uuid;
  v_template_version integer;
BEGIN
  v_cq_id := (SELECT cqv.client_quality_id FROM public.client_quality_versions cqv
              WHERE cqv.id = p_version_id);
  IF v_cq_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Same lock order as the other two functions: client quality, then version.
  PERFORM 1 FROM public.client_qualities cq WHERE cq.id = v_cq_id FOR UPDATE;
  PERFORM 1 FROM public.client_quality_versions cqv WHERE cqv.id = p_version_id FOR UPDATE;
  v_ver := (SELECT cqv FROM public.client_quality_versions cqv WHERE cqv.id = p_version_id);
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_ver.applied_at IS NOT NULL OR v_ver.cancelled_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_ver.effective_from > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'not_due';
  END IF;

  v_template_id := (SELECT t.id
                    FROM public.client_qualities cq
                    JOIN public.quality_templates t ON t.id = cq.template_id
                    WHERE cq.id = v_ver.client_quality_id
                      AND t.is_client_variant);
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'not_a_private_copy';
  END IF;

  PERFORM 1 FROM public.quality_templates qt WHERE qt.id = v_template_id FOR UPDATE;
  v_template_version := (SELECT COALESCE(qt.version, 0) + 1
                         FROM public.quality_templates qt WHERE qt.id = v_template_id);

  UPDATE public.quality_templates qt
  SET parameters = v_ver.spec -> 'template' -> 'parameters',
      version    = v_template_version,
      updated_at = now()
  WHERE qt.id = v_template_id;

  INSERT INTO public.template_versions
    (template_id, version_number, parameters, changes_description, created_by)
  VALUES
    (v_template_id, v_template_version, v_ver.spec -> 'template' -> 'parameters',
     'Client change, version ' || v_ver.version_no,
     -- template_versions.created_by points at profiles; a client author has
     -- no profile, so it is recorded as NULL instead of failing the FK.
     (SELECT p.id FROM public.profiles p WHERE p.id = v_ver.created_by));

  UPDATE public.client_quality_versions cqv
  SET applied_at = now()
  WHERE cqv.id = p_version_id;
END;
$$;

-- 5. Record a Wolthers change (or the current state) as a new version -----------
CREATE OR REPLACE FUNCTION public.record_client_quality_version(
  p_client_quality_id uuid,
  p_source            text,
  p_user              uuid,
  p_note              text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_spec        jsonb;
  v_next        integer;
  v_id          uuid := gen_random_uuid();
  v_latest_id   uuid;
  v_latest_spec jsonb;
BEGIN
  PERFORM 1 FROM public.client_qualities cq WHERE cq.id = p_client_quality_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  v_spec := public.client_quality_spec_snapshot(p_client_quality_id);
  IF v_spec IS NULL THEN
    RAISE EXCEPTION 'no_template';
  END IF;

  -- Dedupe: the live spec still equals the latest applied version, so this
  -- save changed nothing. Return that version and leave every row alone.
  v_latest_id := (SELECT cqv.id
                  FROM public.client_quality_versions cqv
                  WHERE cqv.client_quality_id = p_client_quality_id
                    AND cqv.cancelled_at IS NULL
                    AND cqv.applied_at IS NOT NULL
                  ORDER BY cqv.version_no DESC
                  LIMIT 1);
  IF v_latest_id IS NOT NULL THEN
    v_latest_spec := (SELECT cqv.spec FROM public.client_quality_versions cqv WHERE cqv.id = v_latest_id);
    IF v_latest_spec = v_spec THEN
      RETURN v_latest_id;
    END IF;
  END IF;

  -- Pending = not applied, not cancelled. Still in the future: Wolthers'
  -- change supersedes it before any lot can use it, so cancel it.
  UPDATE public.client_quality_versions cqv
  SET cancelled_at = now(),
      cancelled_by = p_user,
      cancel_note  = 'Cancelled when Wolthers changed this specification'
  WHERE cqv.client_quality_id = p_client_quality_id
    AND cqv.applied_at IS NULL
    AND cqv.cancelled_at IS NULL
    AND cqv.effective_from > v_today;

  -- Already due, but the daily apply has not reached it: lots may be pinned to
  -- it, so it stays a valid version. Mark it applied without writing the
  -- template; the snapshot below supersedes it from today.
  UPDATE public.client_quality_versions cqv
  SET applied_at = now()
  WHERE cqv.client_quality_id = p_client_quality_id
    AND cqv.applied_at IS NULL
    AND cqv.cancelled_at IS NULL
    AND cqv.effective_from <= v_today;

  v_next := (SELECT COALESCE(max(cqv.version_no), 0) + 1
             FROM public.client_quality_versions cqv
             WHERE cqv.client_quality_id = p_client_quality_id);

  INSERT INTO public.client_quality_versions
    (id, client_quality_id, version_no, effective_from, spec, source, note, created_by, applied_at)
  VALUES
    (v_id, p_client_quality_id, v_next, v_today, v_spec, p_source, p_note, p_user, now());

  RETURN v_id;
END;
$$;

-- 6. Insert a client change to template.parameters ------------------------------
CREATE OR REPLACE FUNCTION public.insert_client_quality_version(
  p_client_quality_id uuid,
  p_base_version_id   uuid,
  p_parameters        jsonb,
  p_effective_from    date,
  p_user              uuid,
  p_note              text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_latest_id uuid;
  v_base_spec jsonb;
  v_next      integer;
  v_id        uuid := gen_random_uuid();
BEGIN
  PERFORM 1 FROM public.client_qualities cq WHERE cq.id = p_client_quality_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_effective_from IS NULL OR p_effective_from < v_today THEN
    RAISE EXCEPTION 'past_date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_quality_versions cqv
    WHERE cqv.client_quality_id = p_client_quality_id
      AND cqv.applied_at IS NULL
      AND cqv.cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'pending_change';
  END IF;

  v_latest_id := (SELECT cqv.id
                  FROM public.client_quality_versions cqv
                  WHERE cqv.client_quality_id = p_client_quality_id
                    AND cqv.cancelled_at IS NULL
                  ORDER BY cqv.version_no DESC
                  LIMIT 1);
  IF v_latest_id IS NULL OR v_latest_id IS DISTINCT FROM p_base_version_id THEN
    RAISE EXCEPTION 'stale_base';
  END IF;

  IF p_parameters IS NULL OR jsonb_typeof(p_parameters) <> 'object' THEN
    RAISE EXCEPTION 'invalid_parameters';
  END IF;

  v_base_spec := (SELECT cqv.spec FROM public.client_quality_versions cqv
                  WHERE cqv.id = v_latest_id);

  v_next := (SELECT COALESCE(max(cqv.version_no), 0) + 1
             FROM public.client_quality_versions cqv
             WHERE cqv.client_quality_id = p_client_quality_id);

  INSERT INTO public.client_quality_versions
    (id, client_quality_id, version_no, effective_from, spec, source, note, created_by)
  VALUES
    (v_id, p_client_quality_id, v_next, p_effective_from,
     v_base_spec || jsonb_build_object(
       'template', (v_base_spec -> 'template') || jsonb_build_object('parameters', p_parameters)),
     'client', p_note, p_user);

  IF p_effective_from = v_today THEN
    PERFORM public.apply_client_quality_version(v_id);
  END IF;

  RETURN v_id;
END;
$$;

-- 7. Permissions -----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.record_client_quality_version(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_client_quality_version(uuid, uuid, jsonb, date, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_client_quality_version(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_quality_version(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_client_quality_version(uuid, uuid, jsonb, date, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_client_quality_version(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.client_quality_spec_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_quality_spec_snapshot(uuid) TO authenticated, service_role;

-- 8. Backfill version 1 ------------------------------------------------------------
INSERT INTO public.client_quality_versions
  (client_quality_id, version_no, effective_from, spec, source, applied_at)
SELECT id, 1, DATE '2000-01-01', public.client_quality_spec_snapshot(id), 'migration', now()
FROM public.client_qualities
WHERE template_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 9. Pin lots already started to their quality's version 1 --------------------------
UPDATE public.samples s
SET spec_version_id = v.id
FROM public.client_quality_versions v
WHERE v.client_quality_id = s.quality_spec_id
  AND v.version_no = 1
  AND s.spec_version_id IS NULL
  AND (
       EXISTS (SELECT 1 FROM public.quality_assessments qa
               WHERE qa.sample_id IN (s.id, s.lab_source_sample_id))
    OR EXISTS (SELECT 1 FROM public.certificates c
               WHERE c.sample_id IN (s.id, s.lab_source_sample_id))
    OR EXISTS (SELECT 1 FROM public.cupping_scores cs
               WHERE cs.sample_id IN (s.id, s.lab_source_sample_id))
  );

COMMIT;

-- Verification (one row; the editor shows only the last result set):
--   qualities_without_v1             expect 0
--   pinned_samples                   lots pinned to a spec version
--   unpinned_started_samples         expect 0
--   of_which_quality_has_no_template started lots whose quality has no
--                                    template (no version 1 to pin to)
SELECT
  (SELECT count(*)
   FROM public.client_qualities cq
   WHERE cq.template_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.client_quality_versions v
                     WHERE v.client_quality_id = cq.id AND v.version_no = 1)
  ) AS qualities_without_v1,
  (SELECT count(*) FROM public.samples WHERE spec_version_id IS NOT NULL) AS pinned_samples,
  u.unpinned_started_samples,
  u.of_which_quality_has_no_template
FROM (
  SELECT count(*) AS unpinned_started_samples,
         count(*) FILTER (WHERE cq.template_id IS NULL) AS of_which_quality_has_no_template
  FROM public.samples s
  LEFT JOIN public.client_qualities cq ON cq.id = s.quality_spec_id
  WHERE s.quality_spec_id IS NOT NULL
    AND s.spec_version_id IS NULL
    AND (
         EXISTS (SELECT 1 FROM public.quality_assessments qa
                 WHERE qa.sample_id IN (s.id, s.lab_source_sample_id))
      OR EXISTS (SELECT 1 FROM public.certificates c
                 WHERE c.sample_id IN (s.id, s.lab_source_sample_id))
      OR EXISTS (SELECT 1 FROM public.cupping_scores cs
                 WHERE cs.sample_id IN (s.id, s.lab_source_sample_id))
    )
) u;
