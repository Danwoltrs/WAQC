-- Fold the CVA journey's per-cupper sessions into one shared session per lot.
--
-- Until 2026-09-01 /api/cupping/cva/session minted a session per cupper, so a
-- specialty lot's scores were scattered across as many sessions as it had
-- cuppers. The journey now binds the ROSTER written at assignment
-- ('cva' + 'setup'). This moves the history onto that model.
--
-- Re-runnable: every statement is idempotent, and a second run finds nothing
-- left to move.
--
-- COLUMN TYPES (they are not uniform, and the difference matters here):
--   cupping_sessions.sample_ids    UUID[]   -- real array, so && and = apply
--   cupping_sessions.participants  UUID[]   -- real array, NOT NULL
--   cupping_sessions.cupper_ids    JSONB    -- a JSON array of id strings
-- So cupper_ids is read with jsonb_array_elements_text and written with
-- jsonb_agg, while participants is written with array_agg(... ::uuid).
-- Treating cupper_ids as a uuid[] (unnest / array_length) is a type error.
--
-- NOTE: this migration does NOT self-verify. The Supabase SQL runner
-- autocommits, so a temp table declared ON COMMIT DROP disappears mid-run.
-- Run the verification queries at the bottom separately, afterwards.

-- 0. Collapse re-cuppings FIRST, or every move below can violate
--    uniq_cupping_scores_session_sample_cupper (session_id, sample_id,
--    cupper_id). The merge puts every row for a lot onto ONE session, so a
--    cupper who cupped the same lot in more than one session must end up with
--    a single row. Keep the most recently updated one — the same preference
--    load-cva-certificate-inputs.ts already applies when it orders by
--    updated_at to decide which session a certificate reads.
--
--    THIS DELETES ROWS. On 2026-09-03 it removes exactly 5, none of them a
--    reading anybody relies on: 4 repeats on the soft-deleted 'teste' lot
--    (Anderson x3, Matheus x1) and 1 duplicate null-score row for 032/26,
--    whose surviving sibling is also null. Anderson's certified 8/8 reading of
--    032/26 has a unique key and is untouched. Re-run the audit query D at the
--    bottom before applying if the data may have moved on.
DELETE FROM cupping_scores sc
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY sample_id, cupper_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM cupping_scores
  WHERE protocol = 'cva'
) dup
WHERE sc.id = dup.id AND dup.rn > 1;

-- 1. Lots that already have a roster: move their journey sessions' scores onto
--    it and absorb those sessions' owners into its cupper list.
WITH rosters AS (
  SELECT id, sample_ids
  FROM cupping_sessions
  WHERE session_type = 'cva' AND status = 'setup'
),
journey AS (
  SELECT s.id, r.id AS roster_id
  FROM cupping_sessions s
  JOIN rosters r ON s.sample_ids && r.sample_ids
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
)
UPDATE cupping_scores sc
SET session_id = j.roster_id
FROM journey j
WHERE sc.session_id = j.id;

WITH rosters AS (
  SELECT id, sample_ids, COALESCE(cupper_ids, '[]'::jsonb) AS cupper_ids
  FROM cupping_sessions
  WHERE session_type = 'cva' AND status = 'setup'
),
-- Every id that should end up on the roster: the ones it already lists, plus
-- each absorbed session's cupper list, plus whoever created it. UNION dedupes.
ids AS (
  SELECT r.id AS roster_id, x AS cupper
  FROM rosters r
  CROSS JOIN LATERAL jsonb_array_elements_text(r.cupper_ids) AS x
  UNION
  SELECT r.id, x
  FROM cupping_sessions s
  JOIN rosters r ON s.sample_ids && r.sample_ids
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.cupper_ids, '[]'::jsonb)) AS x
  WHERE s.session_type = 'cva' AND s.status <> 'setup'
  UNION
  SELECT r.id, s.created_by::text
  FROM cupping_sessions s
  JOIN rosters r ON s.sample_ids && r.sample_ids
  WHERE s.session_type = 'cva' AND s.status <> 'setup' AND s.created_by IS NOT NULL
),
merged AS (
  SELECT roster_id,
         jsonb_agg(DISTINCT cupper)          AS cupper_ids,
         array_agg(DISTINCT cupper::uuid)    AS participants
  FROM ids
  GROUP BY roster_id
)
UPDATE cupping_sessions r
SET cupper_ids   = m.cupper_ids,
    participants = m.participants
FROM merged m
WHERE r.id = m.roster_id;

-- 2. Lots cupped before rosters existed (pre-2026-08-30): promote the OLDEST
--    journey session in place and pull its siblings' scores onto it.
WITH orphan AS (
  SELECT s.id, s.sample_ids, s.created_at,
         row_number() OVER (PARTITION BY s.sample_ids ORDER BY s.created_at) AS rn
  FROM cupping_sessions s
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
    AND NOT EXISTS (
      SELECT 1 FROM cupping_sessions r
      WHERE r.session_type = 'cva' AND r.status = 'setup'
        AND r.sample_ids && s.sample_ids
    )
),
promoted AS (
  SELECT id, sample_ids FROM orphan WHERE rn = 1
)
UPDATE cupping_scores sc
SET session_id = p.id
FROM promoted p
JOIN cupping_sessions s
  ON s.session_type = 'cva' AND s.status <> 'setup' AND s.sample_ids = p.sample_ids
WHERE sc.session_id = s.id;

WITH orphan AS (
  SELECT s.id, s.sample_ids, s.created_at,
         row_number() OVER (PARTITION BY s.sample_ids ORDER BY s.created_at) AS rn
  FROM cupping_sessions s
  WHERE s.session_type = 'cva'
    AND s.status <> 'setup'
    AND NOT EXISTS (
      SELECT 1 FROM cupping_sessions r
      WHERE r.session_type = 'cva' AND r.status = 'setup'
        AND r.sample_ids && s.sample_ids
    )
),
promoted AS (SELECT id, sample_ids FROM orphan WHERE rn = 1),
ids AS (
  SELECT p.id AS keep_id, x AS cupper
  FROM promoted p
  JOIN cupping_sessions s ON s.session_type = 'cva' AND s.sample_ids = p.sample_ids
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.cupper_ids, '[]'::jsonb)) AS x
  UNION
  SELECT p.id, s.created_by::text
  FROM promoted p
  JOIN cupping_sessions s ON s.session_type = 'cva' AND s.sample_ids = p.sample_ids
  WHERE s.created_by IS NOT NULL
),
crew AS (
  SELECT keep_id,
         jsonb_agg(DISTINCT cupper)       AS cupper_ids,
         array_agg(DISTINCT cupper::uuid) AS participants
  FROM ids
  GROUP BY keep_id
)
UPDATE cupping_sessions s
SET status       = 'setup',
    cupper_ids   = crew.cupper_ids,
    participants = crew.participants
FROM crew
WHERE s.id = crew.keep_id;

-- 3. Delete the journey sessions that are now empty.
--
--    NOT tidiness: load-cva-certificate-inputs.ts scopes to the NEWEST session
--    holding the lot, so a surviving empty journey session would shadow the
--    roster and render a certificate with no assessment at all.
DELETE FROM cupping_sessions s
WHERE s.session_type = 'cva'
  AND s.status <> 'setup'
  AND NOT EXISTS (SELECT 1 FROM cupping_scores sc WHERE sc.session_id = s.id);

-- 4. Bring every roster's cupper minimum in line with the code
--    (samples-assigned now writes Math.min(cuppers, 2)).
--    jsonb_typeof guards a column that is null or holds a non-array.
UPDATE cupping_sessions
SET min_cuppers_required =
      LEAST(GREATEST(
        CASE WHEN jsonb_typeof(cupper_ids) = 'array' THEN jsonb_array_length(cupper_ids) ELSE 0 END,
        1), 2),
    allow_single_cupper =
      (CASE WHEN jsonb_typeof(cupper_ids) = 'array' THEN jsonb_array_length(cupper_ids) ELSE 0 END) <= 1
WHERE session_type = 'cva' AND status = 'setup';

-- ---------------------------------------------------------------------------
-- Run these SEPARATELY, after applying. Supabase's SQL editor hides NOTICE
-- output, so these return rows rather than raising.
--
-- A. Journey sessions that still hold scores. Expected: 0 rows. Any row here
--    is a lot whose scores could not be moved — investigate, do not re-run.
-- SELECT s.id, s.status, s.sample_ids, count(sc.id) AS scores
-- FROM cupping_sessions s
-- JOIN cupping_scores sc ON sc.session_id = s.id
-- WHERE s.session_type = 'cva' AND s.status <> 'setup'
-- GROUP BY s.id;
--
-- B. Lots whose scores are split across more than one session. Expected: 0.
--    A row here is the known limitation of part 2: it groups roster-less
--    sessions by EXACT sample_ids equality, so two cuppers who opened
--    overlapping-but-different sample sets each keep their own promoted
--    session. Those need a hand-written merge. Do NOT loosen part 2 to an
--    overlap match — && would merge genuinely separate panels that happen to
--    share one lot.
-- SELECT sc.sample_id, count(DISTINCT sc.session_id) AS sessions
-- FROM cupping_scores sc
-- WHERE sc.protocol = 'cva'
-- GROUP BY sc.sample_id
-- HAVING count(DISTINCT sc.session_id) > 1;
--
-- D. PREVIEW OF THE DELETION in part 0 — run this BEFORE applying. Every row
--    it returns is a row part 0 will remove. Check none is a reading you want.
-- SELECT sc.id, sc.sample_id, sc.cupper_id, sc.cva_score, sc.updated_at
-- FROM (
--   SELECT id, sample_id, cupper_id, cva_score, updated_at,
--          row_number() OVER (PARTITION BY sample_id, cupper_id
--                             ORDER BY updated_at DESC NULLS LAST,
--                                      created_at DESC NULLS LAST, id) AS rn
--   FROM cupping_scores WHERE protocol = 'cva'
-- ) sc
-- WHERE sc.rn > 1;
--
-- C. The shape of the result: rosters, their cuppers, their score counts.
-- SELECT s.id, jsonb_array_length(s.cupper_ids) AS cuppers,
--        s.min_cuppers_required, count(sc.id) AS scores
-- FROM cupping_sessions s
-- LEFT JOIN cupping_scores sc ON sc.session_id = s.id
-- WHERE s.session_type = 'cva' AND s.status = 'setup'
-- GROUP BY s.id ORDER BY scores DESC;
