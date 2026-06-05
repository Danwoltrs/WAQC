-- Migration 20260605000001: Gap-free certificate numbering
--
-- Splits the single unified number into two:
--   * Internal lab number (samples.tracking_number) minted at intake from a new
--     per-lab sample_sequences counter (gaps allowed, never seen by buyers).
--   * Official certificate number (certificates.certificate_number) minted at
--     certificate creation from the existing per-(client,lab,year)
--     certificate_sequences counter (gap-free).
--
-- Forward-only: samples.split_numbering defaults false; the cert trigger reuses
-- tracking_number for legacy/in-progress samples (identical current behavior)
-- and mints a fresh number only for split (post-deploy) samples. Safe to apply
-- before deploying the app code.

BEGIN;

-- 1. Short lab prefix for the internal sample number ----------------------------
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS sample_prefix TEXT;
-- Seed known labs; others fall back to 'S-' in the function until configured.
UPDATE laboratories SET sample_prefix = 'SAN-'
  WHERE code = 'SANTOS_HQ' AND (sample_prefix IS NULL OR sample_prefix = '');

-- 2. Per-lab internal sample sequence ------------------------------------------
CREATE TABLE IF NOT EXISTS sample_sequences (
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  year          INT  NOT NULL,
  last_sequence INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (laboratory_id, year)
);

-- 3. Grandfather flag ----------------------------------------------------------
ALTER TABLE samples ADD COLUMN IF NOT EXISTS split_numbering BOOLEAN NOT NULL DEFAULT false;

-- 4. Sub-contract number is filled in after its cert mints ----------------------
ALTER TABLE sample_contracts ALTER COLUMN tracking_number DROP NOT NULL;

-- 5. generate_sample_number(p_laboratory_id) -----------------------------------
CREATE OR REPLACE FUNCTION generate_sample_number(p_laboratory_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix TEXT;
  v_year   INT;
  v_seq    INT;
BEGIN
  IF p_laboratory_id IS NULL THEN
    RAISE EXCEPTION 'generate_sample_number requires p_laboratory_id';
  END IF;

  SELECT NULLIF(sample_prefix, '') INTO v_prefix
  FROM laboratories WHERE id = p_laboratory_id;
  v_prefix := COALESCE(v_prefix, 'S-');

  v_year := EXTRACT(YEAR FROM NOW())::INT;

  INSERT INTO sample_sequences (laboratory_id, year, last_sequence)
  VALUES (p_laboratory_id, v_year, 1)
  ON CONFLICT (laboratory_id, year)
  DO UPDATE SET last_sequence = sample_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_seq;

  RETURN v_prefix || LPAD(v_seq::TEXT, 5, '0') || '/' || TO_CHAR(NOW(), 'YY');
END;
$$;

COMMENT ON FUNCTION generate_sample_number(UUID) IS
  'Internal lab sample number: per-(lab,year) atomic sequence, prefix from '
  'laboratories.sample_prefix. Gaps allowed; not the certificate number.';

-- 6. assign_certificate_number(): mint or reuse at cert INSERT ------------------
CREATE OR REPLACE FUNCTION assign_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_client       UUID;
  v_origin       TEXT;
  v_quality      UUID;
  v_lab          UUID;
  v_tracking     TEXT;
  v_split        BOOLEAN;
  v_sub_tracking TEXT;
BEGIN
  -- Already set (explicit value, legacy caller, or re-issue): idempotent.
  IF NEW.certificate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT client_id, origin, quality_spec_id, laboratory_id, tracking_number, split_numbering
    INTO v_client, v_origin, v_quality, v_lab, v_tracking, v_split
  FROM samples WHERE id = NEW.sample_id;

  IF NEW.sample_contract_id IS NOT NULL THEN
    SELECT tracking_number INTO v_sub_tracking
    FROM sample_contracts WHERE id = NEW.sample_contract_id;
  END IF;

  IF NEW.sample_contract_id IS NOT NULL THEN
    -- Sub-contract cert: reuse its own number if it already has one (legacy
    -- pre-deploy sub-contracts, or a re-issue); otherwise ALWAYS mint a fresh
    -- number. A sub-contract must NEVER inherit the mother's number — that
    -- would collide on the UNIQUE certificate_number (e.g. a legacy mother with
    -- a sub-contract added after deploy). This matches pre-split behavior, where
    -- every sub-contract drew its own number from the cert sequence.
    IF v_sub_tracking IS NOT NULL THEN
      NEW.certificate_number := v_sub_tracking;
    ELSE
      NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSIF COALESCE(v_split, false) = false THEN
    -- Legacy mother: reuse the existing tracking number (today's behavior).
    NEW.certificate_number := v_tracking;
    -- Fallback so the NOT NULL/UNIQUE column always gets a value.
    IF NEW.certificate_number IS NULL AND v_lab IS NOT NULL AND v_client IS NOT NULL THEN
      NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSE
    -- Split mother: mint a gap-free official number. No R- prefix (is_rejected
    -- flag on the row carries rejection; matches the unified-numbering rule).
    NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
  END IF;

  -- Mirror the number onto the sub-contract for display/back-compat.
  IF NEW.sample_contract_id IS NOT NULL AND NEW.certificate_number IS NOT NULL THEN
    UPDATE sample_contracts
    SET tracking_number = NEW.certificate_number
    WHERE id = NEW.sample_contract_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_certificate_number ON certificates;
CREATE TRIGGER trg_assign_certificate_number
  BEFORE INSERT ON certificates
  FOR EACH ROW
  EXECUTE FUNCTION assign_certificate_number();

-- 7. Approval trigger: insert NULL number, let assign_certificate_number decide -
CREATE OR REPLACE FUNCTION auto_generate_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_cert_id UUID;
  v_issued_to        TEXT;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    IF NEW.tracking_number IS NULL OR NEW.tracking_number = '' THEN
      RAISE WARNING 'auto_generate_certificate: sample % has no tracking_number, skipping cert', NEW.id;
      RETURN NEW;
    END IF;

    SELECT id INTO v_existing_cert_id
    FROM certificates
    WHERE sample_id = NEW.id AND sample_contract_id IS NULL
    LIMIT 1;

    IF v_existing_cert_id IS NULL THEN
      SELECT COALESCE(fantasy_name, name, 'Pending')
      INTO v_issued_to FROM companies WHERE id = NEW.client_id;

      INSERT INTO certificates (sample_id, certificate_number, issued_to, status)
      VALUES (NEW.id, NULL, COALESCE(v_issued_to, 'Pending'), 'issued');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
