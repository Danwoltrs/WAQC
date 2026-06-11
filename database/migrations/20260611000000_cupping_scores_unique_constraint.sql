-- =============================================================================
-- Enforce one cupping_scores row per (session_id, sample_id, cupper_id).
--
-- Why: both the CVA and commodity save paths use a non-atomic check-then-insert.
-- A single cupper saving the same sample from two tabs/devices (or an unmount-flush
-- racing a fresh page's debounced save) can insert duplicate rows. Once duplicated,
-- the app's .maybeSingle() lookups throw and reads become non-deterministic.
--
-- The app layer was hardened to self-heal (update-latest + prune older dups), but
-- this index is the durable, atomic guarantee.
--
-- Scope: only rows that are linked to a session (session_id IS NOT NULL). Legacy
-- commodity scores saved without a session are left unconstrained.
-- =============================================================================

-- 1) De-duplicate existing session-linked rows, keeping the most recent per key.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY session_id, sample_id, cupper_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM cupping_scores
  WHERE session_id IS NOT NULL
)
DELETE FROM cupping_scores
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Enforce uniqueness going forward.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cupping_scores_session_sample_cupper
  ON cupping_scores (session_id, sample_id, cupper_id)
  WHERE session_id IS NOT NULL;
