-- Migration: Sync Blaser's tracking_number_format with certificate_pattern
--
-- Issue: The client edit form was only updating certificate_pattern, not tracking_number_format
-- This caused tracking numbers to use the old starting_sequence (50653) from migration 067
--
-- Fix: Copy the current certificate_pattern to tracking_number_format
-- This ensures both use the same configuration going forward

UPDATE clients
SET tracking_number_format = certificate_pattern
WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64'; -- Blaser Trading AG

-- Verify the sync
DO $$
DECLARE
    v_tracking_format JSONB;
    v_cert_format JSONB;
BEGIN
    SELECT tracking_number_format, certificate_pattern
    INTO v_tracking_format, v_cert_format
    FROM clients
    WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64';

    RAISE NOTICE 'Migration 071 completed successfully';
    RAISE NOTICE 'Tracking format: %', v_tracking_format;
    RAISE NOTICE 'Certificate format: %', v_cert_format;

    IF v_tracking_format = v_cert_format THEN
        RAISE NOTICE '✓ Formats are now synchronized';
    ELSE
        RAISE WARNING '✗ Formats do not match - manual intervention required';
    END IF;
END;
$$;

SELECT 'Migration 071: Synced Blaser tracking_number_format with certificate_pattern' as status;
