-- Migration 20260605000002: Restore the R- prefix on rejected certificates
--
-- Follows 20260605000001 (gap-free numbering). Business rule: a REJECTED
-- certificate must carry an 'R-' prefix on its number (e.g. R-SAG-000456/26),
-- as before the unified-numbering change. The number still comes from the
-- gap-free sequence — a rejected cert consumes a slot like any other; 'R-' is
-- only a prefix applied to rejected ones (so the official sequence stays
-- gap-free, with rejections visible as R-<number>).
--
-- Trigger-only: every certificate INSERT already carries the is_rejected flag,
-- and the override route already strips/re-adds R- the same way, so no app code
-- changes are needed. CREATE OR REPLACE FUNCTION takes no table locks.

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
  v_base         TEXT;
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

  -- 1) Determine the clean BASE number (never carrying R-). Mint with
  --    p_is_rejected=false; the rejection prefix is applied uniformly in step 2.
  IF NEW.sample_contract_id IS NOT NULL THEN
    -- Sub-contract cert: reuse its own number if it has one (legacy pre-deploy
    -- sub / re-issue); otherwise ALWAYS mint fresh. A sub-contract must never
    -- inherit the mother's number (would collide on UNIQUE certificate_number).
    IF v_sub_tracking IS NOT NULL THEN
      v_base := v_sub_tracking;
    ELSE
      v_base := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSIF COALESCE(v_split, false) = false THEN
    -- Legacy mother: reuse the existing tracking number.
    v_base := v_tracking;
    IF v_base IS NULL AND v_lab IS NOT NULL AND v_client IS NOT NULL THEN
      v_base := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSE
    -- Split mother: mint a gap-free official number.
    v_base := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
  END IF;

  -- 2) Apply the rejected prefix exactly once. Strip any pre-existing R- first
  --    (a reused sub-contract number may already carry it) to avoid R-R-.
  IF v_base LIKE 'R-%' THEN
    v_base := substring(v_base FROM 3);
  END IF;

  IF COALESCE(NEW.is_rejected, false) THEN
    NEW.certificate_number := 'R-' || v_base;
  ELSE
    NEW.certificate_number := v_base;
  END IF;

  -- Mirror the final number onto the sub-contract for display/back-compat.
  IF NEW.sample_contract_id IS NOT NULL AND NEW.certificate_number IS NOT NULL THEN
    UPDATE sample_contracts
    SET tracking_number = NEW.certificate_number
    WHERE id = NEW.sample_contract_id;
  END IF;

  RETURN NEW;
END;
$$;
