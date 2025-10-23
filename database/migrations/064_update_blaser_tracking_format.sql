-- Migration: Update Blaser's tracking number format to quality-based

-- Blaser currently has: {"type":"standard","pattern":"[5N]-[YY]"}
-- This produces: 00001-25, 00002-25, etc.
--
-- Update to: {"type":"quality_based","pattern":"[QC]-[5N]-[YY]"}
-- This will produce: AD-00001-25, AD-00002-25, etc. (using quality code from client_qualities)

UPDATE clients
SET tracking_number_format = jsonb_build_object(
    'type', 'quality_based',
    'pattern', '[QC]-[5N]-[YY]',
    'separator', '-',
    'rejected_suffix', '-R'
)
WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64'; -- Blaser Trading AG

-- Verify the update
DO $$
DECLARE
    v_blaser_format JSONB;
BEGIN
    SELECT tracking_number_format INTO v_blaser_format
    FROM clients
    WHERE id = '7d5306ac-1118-4c94-999b-e05becc68c64';

    IF v_blaser_format->>'type' != 'quality_based' THEN
        RAISE EXCEPTION 'Migration 064 verification failed: Blaser tracking format not updated correctly';
    END IF;

    RAISE NOTICE 'Migration 064 completed successfully';
    RAISE NOTICE 'Blaser tracking format: %', v_blaser_format;
END;
$$;

SELECT 'Migration 064: Updated Blaser tracking number format to quality-based' as status;
