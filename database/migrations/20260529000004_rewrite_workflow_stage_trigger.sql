-- Rewrite validate_workflow_stage_transition() to avoid the text[][] ANY()
-- comparison. The previous version (migration 098_add_analysis_workflow_stage)
-- did:
--
--   v_valid_transitions := ARRAY[ ARRAY['received','analysis'], ... ];
--   IF NOT (ARRAY[OLD.workflow_stage, NEW.workflow_stage] = ANY(v_valid_transitions))
--
-- which raises `operator does not exist: text[] = text` on some Postgres
-- builds (same family of bugs that migrations 097/098 patched on the RLS
-- side). When that exception fires inside an UPDATE, the row stays put,
-- Supabase surfaces the error, the front-end logs it, and the sample sits
-- stuck at "received" — exactly the case we saw with BD1-008900/26.
--
-- Rewriting with an explicit (OLD, NEW) tuple match removes the ambiguity:
-- the function still allows the same set of transitions, but the SQL is
-- scalar comparisons only.

CREATE OR REPLACE FUNCTION validate_workflow_stage_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- New row: nothing to validate
    IF OLD.workflow_stage IS NULL THEN
        RETURN NEW;
    END IF;

    -- No-op update (touching other fields without changing the stage)
    IF OLD.workflow_stage = NEW.workflow_stage THEN
        RETURN NEW;
    END IF;

    -- Allowed transitions. Keep this list in sync with the workflows the
    -- application understands. Scalar-only comparisons.
    IF (OLD.workflow_stage = 'received'  AND NEW.workflow_stage = 'analysis')  OR
       (OLD.workflow_stage = 'received'  AND NEW.workflow_stage = 'roasting')  OR
       (OLD.workflow_stage = 'roasting'  AND NEW.workflow_stage = 'analysis')  OR
       (OLD.workflow_stage = 'analysis'  AND NEW.workflow_stage = 'review')    OR
       (OLD.workflow_stage = 'review'    AND NEW.workflow_stage = 'certified') OR
       (OLD.workflow_stage = 'review'    AND NEW.workflow_stage = 'rejected')  OR
       -- Manual corrections back from a terminal stage
       (OLD.workflow_stage = 'certified' AND NEW.workflow_stage = 'review')    OR
       (OLD.workflow_stage = 'rejected'  AND NEW.workflow_stage = 'review')
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid workflow stage transition from % to %. Valid: received->analysis (PSS/SS/Type) or received->roasting->analysis (Specialty) ->review->certified/rejected',
        OLD.workflow_stage, NEW.workflow_stage;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_workflow_stage_transition() IS
  'Guards sample.workflow_stage transitions. Rewritten 2026-05-29 to drop the '
  'text[][] ANY() comparison that intermittently raised "operator does not '
  'exist: text[] = text" and left samples stuck at the source stage.';
