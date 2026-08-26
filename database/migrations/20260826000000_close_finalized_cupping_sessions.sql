-- Close the cupping sessions that finished but were never marked completed.
--
-- WHY THIS BACKFILL EXISTS
-- The finalize pipeline closed a session by writing `completed_at`, a column
-- cupping_sessions has never had (the real one is `finalized_at`). Every close
-- therefore failed with 42703, and because that error was only logged and never
-- thrown, nothing downstream looked wrong: the sample still moved to
-- certified/rejected and the certificate still minted. The only symptom was
-- that no session ever left 'active' — 149 active, 0 completed, across the
-- whole table — so finished sessions never dropped out of the cupper's queue
-- (api/cupping/my-samples lists sessions with status in ('active','review')).
--
-- Present since the original finalize workflow (48310ce, 2025-12-03). The code
-- fix ships alongside this file; this only repairs the rows already stranded.
--
-- Criterion: every sample the session holds has reached a terminal stage. A
-- session with even one sample still in progress stays open, and a session
-- referencing a sample row that no longer exists stays open too — better to
-- leave a row for a human than to close one on incomplete evidence.
--
-- Expected on 2026-08-26: 132 of 149 active sessions close, 17 stay open.
-- `finalized_by` is deliberately left NULL: who finalized these was never
-- recorded, and inventing an actor would be worse than an honest blank.

-- Dry run — inspect before applying the UPDATE below.
--   SELECT s.id, s.session_type, s.session_date, cardinality(s.sample_ids) AS samples
--   FROM cupping_sessions s
--   WHERE s.status = 'active'
--     AND s.sample_ids IS NOT NULL
--     AND cardinality(s.sample_ids) > 0
--     AND NOT EXISTS (
--           SELECT 1
--           FROM unnest(s.sample_ids) AS t(sid)
--           LEFT JOIN samples sm ON sm.id = t.sid
--           WHERE sm.id IS NULL
--              OR sm.workflow_stage IS NULL
--              OR sm.workflow_stage::text NOT IN ('certified', 'rejected')
--         )
--   ORDER BY s.session_date DESC;

UPDATE cupping_sessions s
SET status       = 'completed',
    finalized_at = COALESCE(s.finalized_at, s.updated_at, s.created_at),
    updated_at   = now()
WHERE s.status = 'active'
  AND s.sample_ids IS NOT NULL
  AND cardinality(s.sample_ids) > 0
  AND NOT EXISTS (
        SELECT 1
        FROM unnest(s.sample_ids) AS t(sid)
        LEFT JOIN samples sm ON sm.id = t.sid
        WHERE sm.id IS NULL
           OR sm.workflow_stage IS NULL
           OR sm.workflow_stage::text NOT IN ('certified', 'rejected')
      );
