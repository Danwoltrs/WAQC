-- Migration: Fix Workflow Stages to Support Parallel Green Analysis and Cupping
-- Date: 2024-10-31
-- Description: Updates workflow stage validation to reflect that green bean analysis
--              and cupping are independent, parallel processes. Green analysis can happen
--              at any time and doesn't block progression to cupping.

-- Update the workflow_stage comment to reflect correct stages
COMMENT ON COLUMN samples.workflow_stage IS 'Current stage in sample workflow: received, roasting, cupping, review, certified, rejected. Note: green bean analysis is tracked separately in quality_assessments.green_bean_data';

-- Replace the workflow stage validation function to remove green_analysis stage
CREATE OR REPLACE FUNCTION validate_workflow_stage_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_valid_transitions TEXT[][];
BEGIN
    -- Define valid stage transitions
    -- Green analysis is NOT part of main workflow - it's tracked separately
    v_valid_transitions := ARRAY[
        ARRAY['received', 'roasting'],
        ARRAY['roasting', 'cupping'],
        ARRAY['cupping', 'review'],
        ARRAY['review', 'certified'],
        ARRAY['review', 'rejected'],
        -- Allow manual corrections
        ARRAY['certified', 'review'],
        ARRAY['rejected', 'review'],
        -- Allow skipping roasting for calibration samples
        ARRAY['received', 'cupping']
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
        RAISE EXCEPTION 'Invalid workflow stage transition from % to %. Valid transitions: received→roasting→cupping→review→certified/rejected',
            OLD.workflow_stage, NEW.workflow_stage;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update existing samples that are in 'green_analysis' stage to 'received'
-- since green_analysis is no longer a valid workflow stage
UPDATE samples
SET workflow_stage = 'received'
WHERE workflow_stage = 'green_analysis';

-- Verification
DO $$
DECLARE
    v_invalid_stages INTEGER;
BEGIN
    -- Check for any samples with invalid workflow stages
    SELECT COUNT(*) INTO v_invalid_stages
    FROM samples
    WHERE workflow_stage NOT IN ('received', 'roasting', 'cupping', 'review', 'certified', 'rejected')
    AND workflow_stage IS NOT NULL;

    IF v_invalid_stages > 0 THEN
        RAISE WARNING '% samples found with invalid workflow stages', v_invalid_stages;
    END IF;

    RAISE NOTICE 'Workflow stage validation updated successfully!';
    RAISE NOTICE 'Valid workflow: received → roasting → cupping → review → certified/rejected';
    RAISE NOTICE 'Green bean analysis is tracked separately and can happen anytime';
END $$;

-- Final success message
SELECT 'Migration 088_fix_workflow_stages.sql completed successfully!' as status;
