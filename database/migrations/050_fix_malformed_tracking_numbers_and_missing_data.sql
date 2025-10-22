-- Migration 050: Fix malformed tracking numbers and calculate missing bag weights
-- This fixes old samples created before the tracking number and buyer field fixes

-- Fix tracking numbers that are stored as JSON objects
UPDATE samples
SET tracking_number = (tracking_number::jsonb->>'pattern')
WHERE tracking_number LIKE '{%'
  AND tracking_number::jsonb ? 'pattern';

-- Calculate bag_weight_kg for samples that have quantity and count but no weight
UPDATE samples
SET bag_weight_kg = ROUND(((bags_quantity_mt * 1000.0) / bag_count)::numeric, 2)
WHERE bags_quantity_mt IS NOT NULL
  AND bag_count IS NOT NULL
  AND bag_count > 0
  AND bag_weight_kg IS NULL;

-- Verification
DO $$
DECLARE
    v_fixed_tracking INT;
    v_fixed_weight INT;
    v_remaining_json INT;
BEGIN
    -- Count fixed tracking numbers
    SELECT COUNT(*) INTO v_fixed_tracking
    FROM samples
    WHERE tracking_number ~ '^\d{5}-\d{2}';

    -- Count calculated weights
    SELECT COUNT(*) INTO v_fixed_weight
    FROM samples
    WHERE bag_weight_kg IS NOT NULL;

    -- Count remaining JSON tracking numbers
    SELECT COUNT(*) INTO v_remaining_json
    FROM samples
    WHERE tracking_number LIKE '{%';

    RAISE NOTICE 'Migration 050 completed successfully';
    RAISE NOTICE 'Samples with clean tracking numbers: %', v_fixed_tracking;
    RAISE NOTICE 'Samples with calculated bag weight: %', v_fixed_weight;
    RAISE NOTICE 'Remaining JSON tracking numbers: %', v_remaining_json;

    IF v_remaining_json > 0 THEN
        RAISE WARNING 'Still have % samples with JSON tracking numbers - manual review needed', v_remaining_json;
    END IF;
END;
$$;

SELECT 'Migration 050: Fixed malformed tracking numbers and calculated missing bag weights' as status;
