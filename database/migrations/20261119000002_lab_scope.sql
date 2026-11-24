-- 20261119000002_lab_scope.sql
--
-- A lab user reads and writes their own laboratory. HQ reads every laboratory.
--
-- Until now any signed-in user could read every sample and certificate
-- ("Authenticated users can read samples": USING true). With one laboratory
-- working that did no harm; with Buenaventura starting it means Colombia would
-- see Brazil's lots and the other way round.
--
-- The rule (the same as src/lib/auth/lab-scope.ts):
--   READ   a user of the laboratory typed 'hq' (Santos) and any global admin
--          read everything; every other lab user reads their own laboratory.
--   WRITE  everyone writes in their own laboratory only; a global admin
--          anywhere. HQ looking at another laboratory is read-only.
-- Nothing names a laboratory or a country: HQ is whichever lab has type 'hq'.
--
-- Who is NOT touched:
--   - a user with no laboratory on their profile. That is every sys user who
--     reads QC rows from sys, so sys keeps working exactly as before;
--   - portal users (client / supplier / buyer): their own policies decide;
--   - the service role and triggers (no auth.uid() -> no confinement).
--
-- On 2026-11-19 all eight profiles with a laboratory belong to Santos (HQ), all
-- 1,625 samples and 306 cupping sessions are Santos's, and Buenaventura has no
-- staff and no samples: this changes what nobody sees today.
--
-- The policies are RESTRICTIVE: they can only narrow, they sit on top of the
-- permissive ones and of the sys deny policies, and a sys policy reset (which
-- drops PERMISSIVE policies only) leaves them in place.
--
-- Safe to run twice.

BEGIN;

-- Creating a policy locks its table for a moment: fail fast rather than queue.
SET LOCAL lock_timeout = '3s';

-- ── The rule, once ─────────────────────────────────────────────────────────
-- The laboratory the caller is confined to for READING; NULL = not confined.
CREATE OR REPLACE FUNCTION public.qc_read_scope_lab()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.laboratory_id
  FROM profiles p
  JOIN laboratories l ON l.id = p.laboratory_id
  WHERE p.id = auth.uid()
    AND p.is_global_admin IS NOT TRUE
    AND COALESCE(p.qc_role::text, '') NOT IN ('global_admin', 'global_quality_admin', 'client', 'supplier', 'buyer')
    AND lower(COALESCE(l.type::text, '')) <> 'hq'
$function$;

-- The laboratory the caller is confined to for WRITING; NULL = not confined.
-- HQ staff are confined too: they read the other laboratories, they do not
-- work in them.
CREATE OR REPLACE FUNCTION public.qc_write_scope_lab()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.laboratory_id
  FROM profiles p
  WHERE p.id = auth.uid()
    AND p.laboratory_id IS NOT NULL
    AND p.is_global_admin IS NOT TRUE
    AND COALESCE(p.qc_role::text, '') NOT IN ('global_admin', 'global_quality_admin', 'client', 'supplier', 'buyer')
$function$;

REVOKE ALL ON FUNCTION public.qc_read_scope_lab() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qc_write_scope_lab() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qc_read_scope_lab() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.qc_write_scope_lab() TO authenticated, service_role;

-- A cupping session saved without a laboratory (the column allows it, and two
-- routes used to leave it empty) belongs to the laboratory of its samples. It
-- is the caller's only when it lists at least one sample and EVERY sample it
-- lists is in the laboratory the caller is confined to: an empty session, a
-- missing sample or one sample of another laboratory all answer false.
--
-- SECURITY DEFINER on purpose: under the caller's own access the samples of
-- other laboratories are invisible, so "none of them is foreign" would always
-- be true. The laboratory is taken from the caller's own scope, never from an
-- argument, so the function tells a caller nothing about anyone else's lab.
CREATE OR REPLACE FUNCTION public.qc_session_samples_in_scope(p_sample_ids uuid[], p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT CASE WHEN p_write THEN public.qc_write_scope_lab() ELSE public.qc_read_scope_lab() END AS lab
  )
  SELECT scope.lab IS NOT NULL
     AND COALESCE(cardinality(p_sample_ids), 0) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(p_sample_ids) AS listed(id)
       LEFT JOIN samples s ON s.id = listed.id
       WHERE s.laboratory_id IS DISTINCT FROM scope.lab
     )
  FROM scope
$function$;

REVOKE ALL ON FUNCTION public.qc_session_samples_in_scope(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qc_session_samples_in_scope(uuid[], boolean) TO authenticated, service_role;

-- The scope is read once per statement ((SELECT ...) is an init plan), not per row.

-- ── samples ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS samples_lab_scope_select ON public.samples;
CREATE POLICY samples_lab_scope_select ON public.samples
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab()));

DROP POLICY IF EXISTS samples_lab_scope_insert ON public.samples;
CREATE POLICY samples_lab_scope_insert ON public.samples
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS samples_lab_scope_update ON public.samples;
CREATE POLICY samples_lab_scope_update ON public.samples
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()))
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab()));

DROP POLICY IF EXISTS samples_lab_scope_delete ON public.samples;
CREATE POLICY samples_lab_scope_delete ON public.samples
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab()));

-- ── cupping_sessions (carries its own laboratory) ──────────────────────────
-- A session with no laboratory is NOT open to everyone: it follows its samples
-- (qc_session_samples_in_scope above), and is refused when that cannot be shown.
DROP POLICY IF EXISTS cupping_sessions_lab_scope_select ON public.cupping_sessions;
CREATE POLICY cupping_sessions_lab_scope_select ON public.cupping_sessions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.qc_read_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_read_scope_lab())
         OR (laboratory_id IS NULL AND public.qc_session_samples_in_scope(sample_ids, false)));

DROP POLICY IF EXISTS cupping_sessions_lab_scope_insert ON public.cupping_sessions;
CREATE POLICY cupping_sessions_lab_scope_insert ON public.cupping_sessions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab())
              OR (laboratory_id IS NULL AND public.qc_session_samples_in_scope(sample_ids, true)));

DROP POLICY IF EXISTS cupping_sessions_lab_scope_update ON public.cupping_sessions;
CREATE POLICY cupping_sessions_lab_scope_update ON public.cupping_sessions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab())
         OR (laboratory_id IS NULL AND public.qc_session_samples_in_scope(sample_ids, true)))
  WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
              OR laboratory_id = (SELECT public.qc_write_scope_lab())
              OR (laboratory_id IS NULL AND public.qc_session_samples_in_scope(sample_ids, true)));

DROP POLICY IF EXISTS cupping_sessions_lab_scope_delete ON public.cupping_sessions;
CREATE POLICY cupping_sessions_lab_scope_delete ON public.cupping_sessions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.qc_write_scope_lab()) IS NULL
         OR laboratory_id = (SELECT public.qc_write_scope_lab())
         OR (laboratory_id IS NULL AND public.qc_session_samples_in_scope(sample_ids, true)));

-- ── Tables that hang off a sample: certificates, quality_assessments,
--    cupping_scores. A row follows its sample's laboratory. ───────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['certificates', 'quality_assessments', 'cupping_scores'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lab_scope_select', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING ((SELECT public.qc_read_scope_lab()) IS NULL
               OR EXISTS (SELECT 1 FROM public.samples s
                          WHERE s.id = %I.sample_id
                            AND s.laboratory_id = (SELECT public.qc_read_scope_lab())))
    $p$, t || '_lab_scope_select', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lab_scope_insert', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
                    OR EXISTS (SELECT 1 FROM public.samples s
                               WHERE s.id = %I.sample_id
                                 AND s.laboratory_id = (SELECT public.qc_write_scope_lab())))
    $p$, t || '_lab_scope_insert', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lab_scope_update', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING ((SELECT public.qc_write_scope_lab()) IS NULL
               OR EXISTS (SELECT 1 FROM public.samples s
                          WHERE s.id = %I.sample_id
                            AND s.laboratory_id = (SELECT public.qc_write_scope_lab())))
        WITH CHECK ((SELECT public.qc_write_scope_lab()) IS NULL
                    OR EXISTS (SELECT 1 FROM public.samples s
                               WHERE s.id = %I.sample_id
                                 AND s.laboratory_id = (SELECT public.qc_write_scope_lab())))
    $p$, t || '_lab_scope_update', t, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lab_scope_delete', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING ((SELECT public.qc_write_scope_lab()) IS NULL
               OR EXISTS (SELECT 1 FROM public.samples s
                          WHERE s.id = %I.sample_id
                            AND s.laboratory_id = (SELECT public.qc_write_scope_lab())))
    $p$, t || '_lab_scope_delete', t, t);
  END LOOP;
END $$;

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
  v_bad   INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  WHERE c.relnamespace = 'public'::regnamespace
    AND pol.polname LIKE '%\_lab\_scope\_%'
    AND NOT pol.polpermissive;
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'expected 20 restrictive lab-scope policies, found %', v_count;
  END IF;

  -- Nobody may be locked out of their own work: every user this confines for
  -- writing must have a laboratory that exists.
  SELECT count(*) INTO v_bad
  FROM profiles p LEFT JOIN laboratories l ON l.id = p.laboratory_id
  WHERE p.laboratory_id IS NOT NULL AND l.id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% profile(s) point at a laboratory that does not exist', v_bad;
  END IF;

  -- No policy may let a row through just because it names no laboratory.
  SELECT count(*) INTO v_bad
  FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
  WHERE c.relnamespace = 'public'::regnamespace
    AND pol.polname LIKE '%\_lab\_scope\_%'
    AND (COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
        ~* 'laboratory_id IS NULL\)?\s+OR'
  ;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% lab-scope policy(ies) still pass a row with no laboratory', v_bad;
  END IF;

  -- Exactly one HQ, or "HQ reads all" means nothing / too much.
  SELECT count(*) INTO v_count FROM laboratories WHERE lower(type::text) = 'hq';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one laboratory of type hq, found %', v_count;
  END IF;

  RAISE NOTICE 'Lab scope is on: 20 policies over samples, cupping_sessions, certificates, quality_assessments, cupping_scores.';
END $$;

COMMIT;
