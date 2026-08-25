-- Migration 20260824000000: certificate_number is unique PER CLIENT, not globally
--
-- WHY: certificate numbers are minted from certificate_sequences, keyed
-- (client_id, laboratory_id, year) — every QC client runs its OWN number line,
-- continuing the numbering that client has always had (Dunkin Santos ~36991,
-- Floriana ~1766, Rich Coop ~37). But certificates.certificate_number carried a
-- GLOBAL UNIQUE from 001_initial_schema, so two clients could never hold the
-- same number. For clients whose certificate_pattern has no quality/origin
-- prefix the number is bare digits ("000001/26"), so those lines share one
-- namespace and are guaranteed to collide as they advance.
--
-- Hit in prod 2026-08-24: Arvid Nordquist (new QC client, no sequence row,
-- pattern starting_sequence = 1, no prefix) minted "000001/26" — already held
-- by W&A QC. The unique violation aborted the INSERT, which also rolled back
-- the certificate_sequences seed the BEFORE trigger had just written, so the
-- counter never advanced and every retry regenerated the same number. Four
-- approved samples (SAN-00575..00578/26) could not be certified at all.
--
-- WHAT: drop the global unique; enforce uniqueness per (client, number), which
-- is the invariant the business actually has. A client can never see two certs
-- with the same number; two different clients may.
--
-- LIVE-DB SAFETY: each schema change runs in its own short transaction with a
-- lock_timeout, so a lock contended by the running app fails fast (retryable).
-- Every statement is idempotent — re-run the whole script if a step times out.
--
-- VERIFIED BEFORE WRITING (prod, 2026-08-24): 653 certificates, every one
-- resolves to a client, ZERO within-client duplicate numbers — so the unique
-- index in step 4 builds without conflict.

-- 1. Denormalised client on the certificate ------------------------------------
-- A unique index cannot join to samples, so the owning client has to live on the
-- row. Nullable + no default => metadata-only, no table rewrite.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES companies(id);
COMMENT ON COLUMN certificates.client_id IS
  'Owning QC client, denormalised from sample_contracts.client_id (sub-contract '
  'cert) or samples.client_id (mother). Set by assign_certificate_number(); '
  'backs the per-client uniqueness of certificate_number.';
COMMIT;

-- 2. Backfill ------------------------------------------------------------------
-- A sub-contract certificate belongs to the sub-contract's client when it has
-- one of its own (a split sold to a different QC client); otherwise the mother's.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE certificates c
SET client_id = COALESCE(
  (SELECT sc.client_id FROM sample_contracts sc WHERE sc.id = c.sample_contract_id),
  (SELECT s.client_id  FROM samples s          WHERE s.id  = c.sample_id)
)
WHERE c.client_id IS NULL;
COMMIT;

-- 3. Drop the global unique ----------------------------------------------------
-- Dropping the constraint drops its backing index too, so re-create a plain one:
-- /api/samples/[id] and the public certificate slug still look certificates up
-- by number.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_certificate_number_key;
COMMIT;

CREATE INDEX IF NOT EXISTS idx_certificates_certificate_number
  ON certificates(certificate_number);

-- 4. Uniqueness where it actually belongs --------------------------------------
-- Partial: legacy rows that cannot resolve a client (none today) must not block
-- the build, and NULL client_id would make the pair non-comparable anyway.
CREATE UNIQUE INDEX IF NOT EXISTS certificates_client_certificate_number_key
  ON certificates(client_id, certificate_number)
  WHERE client_id IS NOT NULL;

-- 5. Stamp client_id when the number is minted ---------------------------------
-- Identical to 20260605000001 except for the client_id assignment at the end.
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
  v_sub_client   UUID;
BEGIN
  SELECT client_id, origin, quality_spec_id, laboratory_id, tracking_number, split_numbering
    INTO v_client, v_origin, v_quality, v_lab, v_tracking, v_split
  FROM samples WHERE id = NEW.sample_id;

  IF NEW.sample_contract_id IS NOT NULL THEN
    SELECT tracking_number, client_id INTO v_sub_tracking, v_sub_client
    FROM sample_contracts WHERE id = NEW.sample_contract_id;
  END IF;

  -- The owning client is stamped even on a re-issue that already carries a
  -- number, so no row is left without one.
  IF NEW.client_id IS NULL THEN
    NEW.client_id := COALESCE(v_sub_client, v_client);
  END IF;

  -- Already set (explicit value, legacy caller, or re-issue): idempotent.
  IF NEW.certificate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sample_contract_id IS NOT NULL THEN
    -- Sub-contract cert: reuse its own number if it already has one (legacy
    -- pre-deploy sub-contracts, or a re-issue); otherwise ALWAYS mint a fresh
    -- number. A sub-contract must NEVER inherit the mother's number — within
    -- one client that still collides on the per-client unique index.
    IF v_sub_tracking IS NOT NULL THEN
      NEW.certificate_number := v_sub_tracking;
    ELSE
      NEW.certificate_number := generate_certificate_number(v_client, v_origin, v_quality, false, v_lab);
    END IF;
  ELSIF COALESCE(v_split, false) = false THEN
    -- Legacy mother: reuse the existing tracking number (today's behavior).
    NEW.certificate_number := v_tracking;
    -- Fallback so the NOT NULL column always gets a value.
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

-- ----------------------------------------------------------------------------
-- Sanity check (run after applying)
-- ----------------------------------------------------------------------------
-- SELECT COUNT(*) FILTER (WHERE client_id IS NULL) AS unattributed,
--        COUNT(*)                                  AS total
-- FROM certificates;
--
-- -- The four Arvid samples should now certify. Their numbers will be
-- -- 000001/26 .. 000004/26, coexisting with W&A QC's 000001/26.
