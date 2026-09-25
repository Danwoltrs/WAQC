-- Migration 20260925000004: recycle unsent certificate numbers — PART 4 of 5
-- Deleting a sample voids its certificates (and releases the unsent numbers).
-- Needs part 2. The trigger is AFTER UPDATE OF deleted_at: the app's soft
-- delete (DELETE /api/samples/[id]) is the only way a sample is deleted.

CREATE OR REPLACE FUNCTION void_certificates_of_deleted_sample()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert_id UUID;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    FOR v_cert_id IN
      SELECT id FROM certificates WHERE sample_id = NEW.id AND voided_at IS NULL
    LOOP
      PERFORM void_certificate(v_cert_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE TRIGGER trg_void_certificates_of_deleted_sample
  AFTER UPDATE OF deleted_at ON samples
  FOR EACH ROW
  EXECUTE FUNCTION void_certificates_of_deleted_sample();
