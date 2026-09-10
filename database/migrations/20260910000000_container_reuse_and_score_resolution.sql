-- Migration 20260910000000: a container number is an attribute, not an identifier
--                           + a durable record of how a lot's final score was resolved
--
-- PART 1 — container reuse
--   A container legitimately carries more than one shipment sample:
--     * resubmission — the sample is rejected, the shipper reworks the coffee
--       while the container waits, and sends a new sample for the SAME container;
--     * reuse — the same container number comes back 1-3 years later on a
--       completely different shipment.
--   The only rule in the whole schema that could refuse that is the partial
--   unique index idx_unique_exporter_sample_container (mig 20260302000000):
--       UNIQUE (exporter_id, exporter_sample_number, COALESCE(container_nr, id::text))
--       WHERE exporter_sample_number IS NOT NULL
--   It does NOT make container_nr unique on its own — it bites only when the
--   exporter AND the exporter's sample number repeat too, which is exactly the
--   shape of a resubmission (same shipper, same sample number, same container)
--   and of a contract sibling that inherits both fields from its lab unit.
--   It is simply dropped. No replacement index is needed — see the note at the
--   DROP below.
--
-- PART 2 — score resolution
--   Certificate PDFs are never persisted (src/lib/certificate-storage.ts is a
--   deliberate no-op, product decision 2026-06-19), so every certificate
--   re-renders its scores from cupping_scores on each read. Moving the final
--   score from "the master cupper's row" to "the panel average" would therefore
--   silently reprint every certificate ever issued. quality_assessments.
--   score_resolution freezes the numbers that were actually validated, next to
--   resolved_defects which already does the same job for taints/faults. Lots
--   with no resolution row keep the legacy master-wins derivation, so nothing
--   already issued moves.
--
-- APPLY THIS BEFORE DEPLOYING THE CODE.
--   Nothing in the CURRENT build reads or writes score_resolution, so applying
--   it early is harmless. The new build writes the column at every finalize and
--   REFUSES to certify if that write fails (better than certifying on numbers
--   the certificate will not print), so deploying first would stop validation
--   until this runs. Reads were deliberately written as `select('*')` so they
--   degrade rather than break in the window between the two.
--
-- Safe to run on a live database: no data is rewritten, no row is locked for
-- longer than an ALTER TABLE ... ADD COLUMN of a nullable column with no
-- default. Re-running it is a no-op (every statement is IF EXISTS / IF NOT
-- EXISTS, and the CHECK is dropped before it is added).

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- 1. Container reuse ---------------------------------------------------------

-- The blocker. Nothing else in the schema mentions a container column: no CHECK,
-- no trigger, no view, no RLS predicate, no plpgsql body.
DROP INDEX IF EXISTS idx_unique_exporter_sample_container;

-- NO replacement index is created, deliberately.
--   * That unique index existed to ENFORCE a rule, not to serve a query: grep
--     finds no read filtered on (exporter_id, exporter_sample_number).
--   * The plain lookup index on the column already exists — mig 107 created
--     idx_samples_exporter_sample_number ON samples (exporter_sample_number)
--     WHERE exporter_sample_number IS NOT NULL. Re-using that NAME here for a
--     composite index would be silently skipped by CREATE INDEX IF NOT EXISTS,
--     leaving a COMMENT that lied about the index's shape.
--   * The container hint (GET /api/samples/by-container) matches
--     case-insensitively with ILIKE, which no btree serves — a functional index
--     on upper(container_nr) would sit unused because PostgREST cannot express
--     WHERE upper(container_nr) = upper($1). It is one debounced request per
--     sample intake, so a scan is the honest trade, and idx_samples_container_nr
--     (mig 004) still serves exact-equality reads.

COMMENT ON COLUMN samples.container_nr IS
  'Shipping container number. An ATTRIBUTE, not an identifier: the same container carries a resubmitted sample after a rejection, and comes back years later on a different shipment. Never unique, never a lookup key.';

-- 2. Score resolution --------------------------------------------------------

ALTER TABLE quality_assessments
  ADD COLUMN IF NOT EXISTS score_resolution jsonb NULL;

COMMENT ON COLUMN quality_assessments.score_resolution IS
  'How the final cupping score was resolved at validation, frozen so the certificate never re-derives it. Shape: {"mode":"average"|"cupper","protocol":"commodity"|"cva","source_cupper_id":uuid|null,"excluded_cupper_ids":[uuid],"included_cupper_ids":[uuid],"final_scores":{attribute:number},"overall_score":number|null,"cva_score":number|null,"increment":number,"resolved_by":uuid,"resolved_at":timestamptz}. NULL = legacy lot, derived master-wins as before.';

-- Guard the shape enough to catch a wrong-typed write without freezing the
-- schema: it must be a JSON object naming a known mode when present.
ALTER TABLE quality_assessments
  DROP CONSTRAINT IF EXISTS quality_assessments_score_resolution_shape;
ALTER TABLE quality_assessments
  ADD CONSTRAINT quality_assessments_score_resolution_shape
  CHECK (
    score_resolution IS NULL
    OR (
      jsonb_typeof(score_resolution) = 'object'
      AND score_resolution ? 'mode'
      AND score_resolution ->> 'mode' IN ('average', 'cupper')
    )
  );

COMMIT;

-- Verification (run separately; the SELECT below reports the post-state).
--   expect: old_unique_index = 0   -- the blocker is gone
--           container_index  = 1   -- mig 004's plain btree is untouched
--           score_resolution_column = 1
SELECT
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'samples'
       AND indexname = 'idx_unique_exporter_sample_container')      AS old_unique_index,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'samples'
       AND indexname = 'idx_samples_container_nr')                  AS container_index,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'quality_assessments'
       AND column_name = 'score_resolution')                        AS score_resolution_column;
