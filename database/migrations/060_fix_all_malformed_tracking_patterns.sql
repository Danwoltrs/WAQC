-- Migration: Fix all remaining clients with malformed tracking number format

-- Fix all clients where pattern is still an object instead of a string
UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', tracking_number_format->>'type',
    'pattern', tracking_number_format->'pattern'->>'pattern',
    'separator', COALESCE(tracking_number_format->'pattern'->>'separator', tracking_number_format->>'separator', '-'),
    'rejected_suffix', COALESCE(tracking_number_format->>'rejected_suffix', '-R')
)
WHERE tracking_number_format IS NOT NULL
  AND jsonb_typeof(tracking_number_format->'pattern') = 'object';

-- Add rejected_prefix to certificate_pattern for all clients that don't have it
UPDATE clients
SET certificate_pattern =
    CASE
        WHEN certificate_pattern IS NOT NULL THEN
            certificate_pattern || jsonb_build_object('rejected_prefix', 'R-')
        ELSE
            jsonb_build_object(
                'has_quality_code', false,
                'quality_position', 'prefix',
                'has_origin_code', false,
                'origin_position', 'prefix',
                'sequence_padding', 6,
                'starting_sequence', 1,
                'year_format', 'YY',
                'separator', '-',
                'rejected_prefix', 'R-'
            )
    END
WHERE certificate_pattern IS NULL
   OR NOT certificate_pattern ? 'rejected_prefix';

DO $$
DECLARE
    v_malformed_count INT;
BEGIN
    SELECT COUNT(*) INTO v_malformed_count
    FROM clients
    WHERE tracking_number_format IS NOT NULL
      AND jsonb_typeof(tracking_number_format->'pattern') = 'object';

    IF v_malformed_count > 0 THEN
        RAISE EXCEPTION 'Migration 060 verification failed: % clients still have malformed tracking format', v_malformed_count;
    END IF;

    RAISE NOTICE 'Migration 060 completed successfully: Fixed all malformed tracking patterns';
END;
$$;

SELECT 'Migration 060: Fixed all clients with malformed tracking number format' as status;
