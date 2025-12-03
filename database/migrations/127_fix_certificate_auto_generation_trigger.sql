-- Migration 127: Fix or disable the certificate auto-generation trigger
-- The trigger from migration 052 references old column names (importer, buyer)
-- that no longer exist. The samples table now uses importer_id, roaster_id as FKs.
--
-- Since the /api/cupping/finalize endpoint now handles certificate creation
-- (including R- prefix for rejected samples), we disable this trigger to prevent
-- conflicts and errors.

-- ========================================
-- DISABLE THE AUTO-GENERATION TRIGGER
-- ========================================

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_auto_generate_certificate ON samples;

-- Keep the function but update it to be a no-op (in case something calls it)
-- This is safer than dropping since other code might reference it
CREATE OR REPLACE FUNCTION auto_generate_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- This trigger is now disabled.
    -- Certificate generation is handled by the /api/cupping/finalize endpoint
    -- which properly handles both approved and rejected certificates.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_generate_certificate_on_approval IS 'DEPRECATED: Certificate generation is now handled by /api/cupping/finalize endpoint. This function is kept as a no-op for safety.';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Verify trigger no longer exists
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_auto_generate_certificate'
        AND tgrelid = 'samples'::regclass
    ) THEN
        RAISE EXCEPTION 'Migration 127 verification failed: trigger_auto_generate_certificate still exists';
    END IF;

    RAISE NOTICE 'Migration 127 completed successfully';
    RAISE NOTICE 'Certificate auto-generation trigger has been disabled';
    RAISE NOTICE 'Certificate creation is now handled by the cupping finalize API';
END;
$$;

SELECT 'Migration 127: Disabled certificate auto-generation trigger (now handled by finalize API)' as status;
