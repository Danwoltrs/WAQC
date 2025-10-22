-- Migration 052: Create trigger to auto-generate certificates when samples are approved
-- This trigger automatically creates a certificate when a sample status changes to 'approved'

-- ========================================
-- TRIGGER FUNCTION: Auto-generate certificate on approval
-- ========================================

CREATE OR REPLACE FUNCTION auto_generate_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_cert_number TEXT;
    v_existing_cert_id UUID;
BEGIN
    -- Only proceed if status changed to 'approved' and it wasn't already approved
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN

        -- Check if certificate already exists for this sample
        SELECT id INTO v_existing_cert_id
        FROM certificates
        WHERE sample_id = NEW.id
        LIMIT 1;

        -- Only create if no certificate exists
        IF v_existing_cert_id IS NULL THEN
            -- Generate certificate number using our function
            v_cert_number := generate_certificate_number(
                NEW.client_id,
                NEW.origin,
                NEW.quality_spec_id
            );

            -- Insert certificate record
            INSERT INTO certificates (
                sample_id,
                certificate_number,
                issued_to,
                status
            ) VALUES (
                NEW.id,
                v_cert_number,
                COALESCE(NEW.importer, NEW.buyer, 'Pending'),  -- Use importer, fallback to buyer or 'Pending'
                'issued'
            );

            RAISE NOTICE 'Auto-generated certificate % for sample %', v_cert_number, NEW.tracking_number;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_generate_certificate_on_approval IS 'Automatically generates a certificate when a sample is approved. Uses client-specific certificate patterns and includes importer information.';

-- ========================================
-- CREATE TRIGGER
-- ========================================

DROP TRIGGER IF EXISTS trigger_auto_generate_certificate ON samples;

CREATE TRIGGER trigger_auto_generate_certificate
    AFTER INSERT OR UPDATE OF status
    ON samples
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_certificate_on_approval();

COMMENT ON TRIGGER trigger_auto_generate_certificate ON samples IS 'Triggers certificate auto-generation when sample status changes to approved';

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
BEGIN
    -- Check trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_auto_generate_certificate'
    ) THEN
        RAISE EXCEPTION 'Migration 052 verification failed: trigger_auto_generate_certificate not created';
    END IF;

    -- Check function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'auto_generate_certificate_on_approval'
    ) THEN
        RAISE EXCEPTION 'Migration 052 verification failed: auto_generate_certificate_on_approval function not created';
    END IF;

    RAISE NOTICE 'Migration 052 completed successfully';
    RAISE NOTICE 'Certificate auto-generation trigger is now active';
    RAISE NOTICE 'Certificates will be automatically created when samples are approved';
END;
$$;

SELECT 'Migration 052: Created certificate auto-generation trigger' as status;
