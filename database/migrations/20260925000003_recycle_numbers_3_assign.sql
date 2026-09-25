-- Migration 20260925000003: recycle unsent certificate numbers — PART 3 of 5
-- assign_certificate_number() mints through the pool, and never for a deleted sample.
-- Needs part 2.
--
-- Same as 20260824000000 except:
--   * every generate_certificate_number() call goes through mint_certificate_number();
--   * a deleted sample gets no certificate row and so burns no number. A group
--     certification still listed contract rows deleted before it (fetchGroup
--     read deleted rows) and minted numbers nobody would ever see
--     (BR-037365/26, /366, /372 on 2026-09-21; BR-037407..411/26 on
--     2026-09-23). The row is skipped rather than
--     refused, so any insert that still lists a deleted row goes through for
--     the live ones.
--   * SECURITY DEFINER, so the app's role no longer needs EXECUTE on the
--     minting functions, and the API can no longer call them (see the end).
--   * the sample row is assigned to a row variable: no select-with-target (see part 1).

CREATE OR REPLACE FUNCTION assign_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sample       samples%ROWTYPE;
  v_sub_tracking TEXT;
  v_sub_client   UUID;
BEGIN
  v_sample := (SELECT s FROM samples s WHERE s.id = NEW.sample_id);

  IF NEW.sample_contract_id IS NOT NULL THEN
    v_sub_tracking := (SELECT tracking_number FROM sample_contracts WHERE id = NEW.sample_contract_id);
    v_sub_client   := (SELECT client_id FROM sample_contracts WHERE id = NEW.sample_contract_id);
  END IF;

  -- The owning client is stamped even on a re-issue that already carries a
  -- number, so no row is left without one.
  IF NEW.client_id IS NULL THEN
    NEW.client_id := COALESCE(v_sub_client, v_sample.client_id);
  END IF;

  -- Already set (explicit value, legacy caller, or re-issue): idempotent.
  IF NEW.certificate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_sample.deleted_at IS NOT NULL THEN
    RAISE WARNING 'assign_certificate_number: sample % is deleted, no certificate minted', NEW.sample_id;
    RETURN NULL;
  END IF;

  IF NEW.sample_contract_id IS NOT NULL THEN
    -- Sub-contract cert: reuse its own number if it already has one (legacy
    -- pre-deploy sub-contracts, or a re-issue); otherwise ALWAYS mint a fresh
    -- number. A sub-contract must NEVER inherit the mother's number — within
    -- one client that still collides on the per-client unique index.
    IF v_sub_tracking IS NOT NULL THEN
      NEW.certificate_number := v_sub_tracking;
    ELSE
      NEW.certificate_number := mint_certificate_number(
        v_sample.client_id, v_sample.origin, v_sample.quality_spec_id, v_sample.laboratory_id, NEW.client_id);
    END IF;
  ELSIF COALESCE(v_sample.split_numbering, false) = false THEN
    -- Legacy mother: reuse the existing tracking number (today's behavior).
    NEW.certificate_number := v_sample.tracking_number;
    -- Fallback so the NOT NULL column always gets a value.
    IF NEW.certificate_number IS NULL AND v_sample.laboratory_id IS NOT NULL AND v_sample.client_id IS NOT NULL THEN
      NEW.certificate_number := mint_certificate_number(
        v_sample.client_id, v_sample.origin, v_sample.quality_spec_id, v_sample.laboratory_id, NEW.client_id);
    END IF;
  ELSE
    -- Split mother: the official, gap-free number. No R- prefix (is_rejected
    -- flag on the row carries rejection; matches the unified-numbering rule).
    NEW.certificate_number := mint_certificate_number(
      v_sample.client_id, v_sample.origin, v_sample.quality_spec_id, v_sample.laboratory_id, NEW.client_id);
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

-- Only the trigger mints now. Every function in public is executable by the
-- API roles by default, so without this any signed-in user (a portal client
-- included) could advance a client's line through /rest/v1/rpc. service_role
-- (server-side only) keeps its grant.
REVOKE ALL ON FUNCTION mint_certificate_number(UUID, TEXT, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  f REGPROCEDURE;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'generate_certificate_number'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
