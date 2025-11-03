-- Migration 099: Add 'specialty' to sample_type_enum
-- Date: 2025-11-03
-- Description: Adds 'specialty' as a valid sample type to support manual roasting workflow

-- Add 'specialty' to the sample_type_enum
ALTER TYPE sample_type_enum ADD VALUE IF NOT EXISTS 'specialty';

-- Update the comment on the sample_type column to reflect the new option
COMMENT ON COLUMN samples.sample_type IS 'Type of sample: pss (Pre-Shipment Sample), ss (Shipment Sample), type (Type Sample for client approval), or specialty (requires manual roasting)';

-- Verification
DO $$
DECLARE
    v_enum_values TEXT;
BEGIN
    -- Get all enum values
    SELECT string_agg(enumlabel, ', ' ORDER BY enumlabel) INTO v_enum_values
    FROM pg_enum
    WHERE enumtypid = 'sample_type_enum'::regtype;

    RAISE NOTICE 'sample_type_enum values: %', v_enum_values;

    -- Verify specialty was added
    IF v_enum_values LIKE '%specialty%' THEN
        RAISE NOTICE '✓ specialty type added successfully!';
    ELSE
        RAISE WARNING '✗ specialty type was not added';
    END IF;
END $$;

-- Final success message
SELECT 'Migration 099_add_specialty_sample_type.sql completed successfully!' as status;
