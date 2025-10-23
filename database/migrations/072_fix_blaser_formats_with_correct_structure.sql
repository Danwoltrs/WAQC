-- Migration: Fix Blaser's tracking_number_format and certificate_pattern
--
-- Issue: Migration 071 copied certificate_pattern which may have had wrong structure
-- Result: Tracking numbers became null
--
-- Fix: Explicitly set both formats to the correct JSONB structure

UPDATE clients
SET
  tracking_number_format = jsonb_build_object(
    'type', 'quality_based',
    'pattern', '[QC]-[6N][YY]',
    'separator', '-',
    'starting_sequence', 16540,  -- Set to your desired starting number
    'sequence_padding', 6,
    'year_separator', '/',
    'rejected_suffix', '-R'
  ),
  certificate_pattern = jsonb_build_object(
    'type', 'quality_based',
    'pattern', '[QC]-[6N][YY]',
    'separator', '-',
    'starting_sequence', 16540,  -- Same as tracking_number_format
    'sequence_padding', 6,
    'year_separator', '/',
    'rejected_suffix', '-R'
  )
WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64'; -- Blaser Trading AG

-- Verify the fix
DO $$
DECLARE
    v_tracking_format JSONB;
    v_cert_format JSONB;
    v_test_tracking TEXT;
BEGIN
    SELECT tracking_number_format, certificate_pattern
    INTO v_tracking_format, v_cert_format
    FROM clients
    WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64';

    RAISE NOTICE 'Migration 072 completed';
    RAISE NOTICE 'Tracking format: %', v_tracking_format;
    RAISE NOTICE 'Certificate format: %', v_cert_format;

    -- Test the tracking number generation
    SELECT generate_tracking_number(
        '7d5306ac-1118-4c94-999b-e05becc68c64',  -- Blaser's client_id
        NULL,  -- laboratory_id
        'Brazil',  -- origin
        (SELECT id FROM client_qualities WHERE client_id = '7d5306ac-1118-4c94-999b-e05becc68c64' AND quality_code = 'BD' LIMIT 1),  -- Blaser Dulce quality
        false,  -- not rejected
        'pss'   -- sample type
    ) INTO v_test_tracking;

    RAISE NOTICE 'Test tracking number: % (expected: BD-016540/25)', v_test_tracking;
END;
$$;

SELECT 'Migration 072: Fixed Blaser formats with correct structure (starting_sequence: 16540)' as status;
