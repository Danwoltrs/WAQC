-- Migration: Fix Blaser tracking number double slash issue

-- The pattern '[QC]-[6N]/[YY]' has a hardcoded '/' before [YY]
-- But the function also adds year_separator when replacing [YY]
-- This causes: AD-050653 + / + /25 = AD-050653//25
--
-- Fix: Remove the '/' from the pattern, let year_separator handle it
-- Pattern: '[QC]-[6N][YY]' (the year_separator will add the '/')

UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', 'quality_based',
    'pattern', '[QC]-[6N][YY]',  -- Removed the / before [YY]
    'separator', '-',
    'starting_sequence', 50653,
    'sequence_padding', 6,
    'year_separator', '/',  -- This will be added by the function
    'rejected_suffix', '-R'
)
WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64'; -- Blaser Trading AG

-- Verify the fix
DO $$
DECLARE
    v_blaser_format JSONB;
BEGIN
    SELECT tracking_number_format INTO v_blaser_format
    FROM clients
    WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64';

    IF v_blaser_format->>'pattern' != '[QC]-[6N][YY]' THEN
        RAISE EXCEPTION 'Migration 067 verification failed: Pattern not updated correctly. Got: %', v_blaser_format->>'pattern';
    END IF;

    RAISE NOTICE 'Migration 067 completed successfully';
    RAISE NOTICE 'Blaser tracking format: %', v_blaser_format;
END;
$$;

SELECT 'Migration 067: Fixed Blaser tracking number double slash (AD-050653/25)' as status;
