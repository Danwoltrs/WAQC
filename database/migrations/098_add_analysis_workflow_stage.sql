-- Migration 098: Add 'analysis' workflow stage for simultaneous grading and cupping
-- Date: 2025-11-03
-- Description: Updates workflow stages to support the correct coffee QC process:
--              - PSS/SS/Type samples: received → analysis (green grading + cupping done together)
--              - Specialty samples: received → roasting → analysis (roasting done manually when ready)

-- Update the workflow_stage comment
COMMENT ON COLUMN samples.workflow_stage IS 'Current stage in sample workflow: received, analysis, roasting (specialty only), review, certified, rejected. Analysis stage allows simultaneous green bean grading and cupping.';

-- Replace the workflow stage validation function to include 'analysis' stage
CREATE OR REPLACE FUNCTION validate_workflow_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_valid_transitions TEXT[][];
BEGIN
    -- Define valid stage transitions
    v_valid_transitions := ARRAY[
        -- Standard flow for PSS/SS/Type samples
        ARRAY['received', 'analysis'],           -- Direct to analysis for regular samples
        -- Specialty sample flow
        ARRAY['received', 'roasting'],           -- Specialty samples can go to roasting
        ARRAY['roasting', 'analysis'],           -- After roasting, move to analysis
        -- Analysis to review
        ARRAY['analysis', 'review'],
        -- Review outcomes
        ARRAY['review', 'certified'],
        ARRAY['review', 'rejected'],
        -- Allow manual corrections
        ARRAY['certified', 'review'],
        ARRAY['rejected', 'review']
    ];

    -- Skip validation for new records
    IF OLD.workflow_stage IS NULL THEN
        RETURN NEW;
    END IF;

    -- Allow staying in the same stage (for other field updates)
    IF OLD.workflow_stage = NEW.workflow_stage THEN
        RETURN NEW;
    END IF;

    -- Check if transition is valid
    IF NOT (ARRAY[OLD.workflow_stage, NEW.workflow_stage] = ANY(v_valid_transitions)) THEN
        RAISE EXCEPTION 'Invalid workflow stage transition from % to %. Valid transitions: received→analysis (PSS/SS/Type) or received→roasting→analysis (Specialty) →review→certified/rejected',
            OLD.workflow_stage, NEW.workflow_stage;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing samples that are in 'roasting' or 'cupping' stage to 'analysis'
UPDATE samples
SET workflow_stage = 'analysis'
WHERE workflow_stage IN ('roasting', 'cupping', 'green_analysis');

-- Verification
DO $$
DECLARE
    v_invalid_stages INTEGER;
BEGIN
    -- Check for any samples with invalid workflow stages
    SELECT COUNT(*) INTO v_invalid_stages
    FROM samples
    WHERE workflow_stage NOT IN ('received', 'analysis', 'roasting', 'review', 'certified', 'rejected')
    AND workflow_stage IS NOT NULL;

    IF v_invalid_stages > 0 THEN
        RAISE WARNING '% samples found with invalid workflow stages', v_invalid_stages;
    END IF;

    RAISE NOTICE 'Workflow stage validation updated successfully!';
    RAISE NOTICE 'Valid workflows:';
    RAISE NOTICE '  - PSS/SS/Type: received → analysis → review → certified/rejected';
    RAISE NOTICE '  - Specialty: received → roasting (manual) → analysis → review → certified/rejected';
    RAISE NOTICE 'Analysis stage allows simultaneous green bean grading and cupping';
END $$;

-- Final success message
SELECT 'Migration 098_add_analysis_workflow_stage.sql completed successfully!' as status;
