-- Migration 20260624000000: Allow direct certified <-> rejected workflow_stage
-- transitions so the certificate "Override Status" action works.
--
-- Bug: overriding a certificate's status (e.g. a rejected coffee re-approved by
-- a quality manager) called PATCH /api/certificates/[id]/override, which sets
-- samples.workflow_stage directly to 'certified' (approve) or 'rejected'
-- (reject). The current validate_workflow_stage_transition() only allowed
-- terminal stages to step back to 'review' (certified->review, rejected->review)
-- -- NOT a direct certified<->rejected jump. So the trigger raised
--   "Invalid workflow stage transition from rejected to certified"
-- the samples UPDATE failed, the front-end showed "Failed to update sample
-- status", and the sample stayed at its old status while the certificate row had
-- already been flipped (cert/sample divergence -- e.g. ED-001016/26).
--
-- An override IS a deliberate manual terminal-to-terminal correction, so we add
-- the two direct transitions. The normal pipeline (review->certified/rejected)
-- and the existing back-to-review corrections are preserved unchanged.

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
       (OLD.workflow_stage = 'rejected'  AND NEW.workflow_stage = 'review')    OR
       -- Certificate status override: direct terminal-to-terminal correction
       (OLD.workflow_stage = 'rejected'  AND NEW.workflow_stage = 'certified') OR
       (OLD.workflow_stage = 'certified' AND NEW.workflow_stage = 'rejected')
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid workflow stage transition from % to %. Valid: received->analysis (PSS/SS/Type) or received->roasting->analysis (Specialty) ->review->certified/rejected; certified<->rejected allowed for status overrides',
        OLD.workflow_stage, NEW.workflow_stage;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_workflow_stage_transition() IS
  'Guards sample.workflow_stage transitions. 2026-06-24: added direct '
  'certified<->rejected transitions so the certificate Override Status action '
  'can re-approve/re-reject a finalized sample in one update.';
