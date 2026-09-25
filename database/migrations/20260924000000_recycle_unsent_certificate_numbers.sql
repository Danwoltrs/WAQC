-- Migration 20260924000000: a deleted, never-sent certificate gives its number back
--
-- WHY: since 2026-09-17 any lab user may delete a certified sample (audited,
-- 20260917000000). The certificate row keeps its number and leaves the
-- /certificates list with the sample, so the client's number line shows a
-- hole. Prod 2026-09-23, Dunkin Santos: BR-037406/26 was followed by
-- BR-037412/26 — five certified samples had been deleted in between.
--
-- WHAT:
--   * Deleting a sample voids its certificates. A voided certificate that was
--     never sent (no sent email, no certificate_sent event, no public QR
--     download) releases its sequence into certificate_number_pool; the voided
--     row keeps the number in voided_number and its certificate_number is
--     suffixed " VOID-<id8>" so the per-client unique index lets it go.
--   * assign_certificate_number() takes the lowest released number of the line
--     (client, lab, current year) before advancing certificate_sequences.
--   * A certificate that WAS sent keeps its number: it is out in the world, so
--     that number stays burned (still voided, never reissued).
--
-- Only split-numbering samples release (their official number is minted at
-- certification and appears nowhere else). Legacy samples, whose tracking
-- number IS the certificate number, keep today's behaviour.
--
-- Safe to re-run: every statement is idempotent. Minting and releasing happen
-- in the caller's transaction, so a failed insert or delete puts the number
-- back where it was.

-- 1. Void markers on certificates ----------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS voided_number TEXT;
COMMENT ON COLUMN certificates.voided_at IS
  'Set when the certificate''s sample was deleted. A voided certificate is never shown or sent.';
COMMENT ON COLUMN certificates.voided_number IS
  'The number the certificate carried before it was voided. certificate_number then carries a " VOID-<id8>" suffix.';
COMMIT;

-- 2. Released numbers ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS certificate_number_pool (
  client_id      UUID NOT NULL,
  laboratory_id  UUID NOT NULL,
  year           INT  NOT NULL,
  sequence       INT  NOT NULL,
  certificate_id UUID REFERENCES certificates(id) ON DELETE SET NULL,
  released_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, laboratory_id, year, sequence)
);
-- Written and read only by the SECURITY DEFINER functions below.
ALTER TABLE certificate_number_pool ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE certificate_number_pool IS
  'Sequences of voided, never-sent certificates, per certificate_sequences line. '
  'assign_certificate_number() hands out the lowest one before minting a new number.';

-- 3. The sequence inside a formatted number --------------------------------------
-- Every pattern is [non-digit prefix]DIGITS[non-digit suffix]/YY(YY). A prefix
-- or suffix with digits in it does not match, and such a number is simply never
-- released (safe: it stays burned, as before).
CREATE OR REPLACE FUNCTION certificate_number_sequence(p_number TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT (substring(p_number FROM '^\D*(\d+)\D*/\d{2,4}$'))::INT
$fn$;

-- 4. generate_certificate_number(): optional explicit sequence -----------------
-- Identical to 20260529000008 except p_sequence: when given, that sequence is
-- formatted as-is and certificate_sequences is not touched. The 5-arg version is
-- dropped so 5-arg calls resolve to this one (p_sequence defaults to NULL).
-- Not wrapped in BEGIN/COMMIT: the Supabase SQL editor mis-splits a function
-- body inside an explicit transaction. Every function body uses a named
-- dollar tag ($fn$) for the same reason.
DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_spec_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false,
    p_laboratory_id UUID DEFAULT NULL,
    p_sequence INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_pattern JSONB;
    v_has_quality BOOLEAN;
    v_quality_position TEXT;
    v_has_origin BOOLEAN;
    v_origin_position TEXT;
    v_padding INT;
    v_starting_seq INT;
    v_lab_specific_start INT;
    v_year_format TEXT;
    v_separator TEXT;
    v_rejected_prefix TEXT;
    v_sequence INT;
    v_year_int INT;
    v_year TEXT;
    v_quality_code TEXT;
    v_origin_code TEXT;
    v_result TEXT := '';
    v_prefix TEXT := '';
    v_suffix TEXT := '';
BEGIN
    IF p_laboratory_id IS NULL THEN
        RAISE EXCEPTION 'generate_certificate_number now requires p_laboratory_id (per-lab sequences). Pass the sample''s laboratory_id.';
    END IF;

    SELECT certificate_pattern INTO v_pattern
    FROM qc_client_settings
    WHERE company_id = p_client_id;

    IF v_pattern IS NULL THEN
        v_pattern := jsonb_build_object(
            'has_quality_code', false,
            'quality_position', 'prefix',
            'has_origin_code', false,
            'origin_position', 'prefix',
            'sequence_padding', 6,
            'starting_sequence', 1,
            'year_format', 'YY',
            'separator', '-',
            'rejected_prefix', 'R-'
        );
    END IF;

    v_has_quality := COALESCE((v_pattern->>'has_quality_code')::boolean, false);
    v_quality_position := COALESCE(v_pattern->>'quality_position', 'prefix');
    v_has_origin := COALESCE((v_pattern->>'has_origin_code')::boolean, false);
    v_origin_position := COALESCE(v_pattern->>'origin_position', 'prefix');
    v_padding := COALESCE((v_pattern->>'sequence_padding')::int, 6);
    v_starting_seq := COALESCE((v_pattern->>'starting_sequence')::int, 1);
    v_year_format := COALESCE(v_pattern->>'year_format', 'YY');
    v_separator := COALESCE(v_pattern->>'separator', '-');
    v_rejected_prefix := COALESCE(v_pattern->>'rejected_prefix', 'R-');

    SELECT starting_sequence INTO v_lab_specific_start
    FROM client_laboratory_config
    WHERE client_id = p_client_id
      AND laboratory_id = p_laboratory_id;

    IF v_lab_specific_start IS NOT NULL THEN
        v_starting_seq := v_lab_specific_start;
    END IF;

    v_year_int := EXTRACT(YEAR FROM NOW())::INT;

    IF p_sequence IS NOT NULL THEN
        v_sequence := p_sequence;
    ELSE
        -- Atomic per-(client, lab, year) increment.
        INSERT INTO certificate_sequences (client_id, laboratory_id, year, last_sequence)
        VALUES (p_client_id, p_laboratory_id, v_year_int, v_starting_seq)
        ON CONFLICT (client_id, laboratory_id, year)
        DO UPDATE SET last_sequence = certificate_sequences.last_sequence + 1
        RETURNING last_sequence INTO v_sequence;
    END IF;

    IF v_year_format = 'YYYY' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
    ELSE
        v_year := TO_CHAR(NOW(), 'YY');
    END IF;

    IF v_has_quality AND p_quality_spec_id IS NOT NULL THEN
        SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2), 'QC'))
        INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_spec_id
        LIMIT 1;

        v_quality_code := COALESCE(v_quality_code, 'QC');
    END IF;

    IF v_has_origin AND p_origin IS NOT NULL THEN
        SELECT country_code INTO v_origin_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        v_origin_code := COALESCE(v_origin_code, UPPER(SUBSTRING(p_origin FROM 1 FOR 2)));
    END IF;

    IF v_has_quality AND v_quality_position = 'prefix' THEN
        v_prefix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'prefix' THEN
        v_prefix := v_origin_code;
    END IF;

    IF v_has_quality AND v_quality_position = 'suffix' THEN
        v_suffix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'suffix' THEN
        v_suffix := v_origin_code;
    END IF;

    IF p_is_rejected THEN
        v_result := v_rejected_prefix;
    END IF;

    IF v_prefix != '' THEN
        v_result := v_result || v_prefix || v_separator;
    END IF;

    v_result := v_result || LPAD(v_sequence::TEXT, v_padding, '0');

    IF v_suffix != '' THEN
        v_result := v_result || v_separator || v_suffix;
    END IF;

    v_result := v_result || '/' || v_year;

    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION generate_certificate_number(UUID, TEXT, UUID, BOOLEAN, UUID, INT) IS
  'Generate a per-(client, laboratory, year) certificate number from the company '
  'certificate_pattern. With p_sequence, formats that sequence without advancing '
  'certificate_sequences (a released number being reissued).';

-- 5. mint_certificate_number(): released number first, then a new one ----------
CREATE OR REPLACE FUNCTION mint_certificate_number(
  p_client_id UUID,
  p_origin TEXT,
  p_quality_spec_id UUID,
  p_laboratory_id UUID,
  p_cert_client_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_year   INT := EXTRACT(YEAR FROM NOW())::INT;
  v_seq    INT;
  v_number TEXT;
BEGIN
  LOOP
    -- Lowest released number of this line. SKIP LOCKED: two certifications at
    -- once never take the same number; the second one takes the next.
    DELETE FROM certificate_number_pool p
    WHERE (p.client_id, p.laboratory_id, p.year, p.sequence) IN (
      SELECT client_id, laboratory_id, year, sequence
      FROM certificate_number_pool
      WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year
      ORDER BY sequence
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING p.sequence INTO v_seq;

    EXIT WHEN v_seq IS NULL;

    v_number := generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id, v_seq);
    -- Never hand out a number a live certificate of this client already holds
    -- (e.g. the pattern changed since it was released). Drop it and try the next.
    IF NOT EXISTS (
      SELECT 1 FROM certificates
      WHERE client_id = p_cert_client_id AND certificate_number = v_number
    ) THEN
      RETURN v_number;
    END IF;
    v_seq := NULL;
  END LOOP;

  RETURN generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id);
END;
$fn$;

-- 6. assign_certificate_number(): mint through the pool ------------------------
-- Identical to 20260824000000 except the three generate_certificate_number
-- calls now go through mint_certificate_number.
CREATE OR REPLACE FUNCTION assign_certificate_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
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

  IF NEW.client_id IS NULL THEN
    NEW.client_id := COALESCE(v_sub_client, v_client);
  END IF;

  -- Already set (explicit value, legacy caller, or re-issue): idempotent.
  IF NEW.certificate_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sample_contract_id IS NOT NULL THEN
    IF v_sub_tracking IS NOT NULL THEN
      NEW.certificate_number := v_sub_tracking;
    ELSE
      NEW.certificate_number := mint_certificate_number(v_client, v_origin, v_quality, v_lab, NEW.client_id);
    END IF;
  ELSIF COALESCE(v_split, false) = false THEN
    -- Legacy mother: reuse the existing tracking number (today's behavior).
    NEW.certificate_number := v_tracking;
    IF NEW.certificate_number IS NULL AND v_lab IS NOT NULL AND v_client IS NOT NULL THEN
      NEW.certificate_number := mint_certificate_number(v_client, v_origin, v_quality, v_lab, NEW.client_id);
    END IF;
  ELSE
    -- Split mother: the official, gap-free number.
    NEW.certificate_number := mint_certificate_number(v_client, v_origin, v_quality, v_lab, NEW.client_id);
  END IF;

  IF NEW.sample_contract_id IS NOT NULL AND NEW.certificate_number IS NOT NULL THEN
    UPDATE sample_contracts
    SET tracking_number = NEW.certificate_number
    WHERE id = NEW.sample_contract_id;
  END IF;

  RETURN NEW;
END;
$fn$;

-- 7. void_certificate(): void one certificate, release its number if unsent ----
-- Returns true when the number went back to the pool.
CREATE OR REPLACE FUNCTION void_certificate(p_certificate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cert     RECORD;
  v_seq      INT;
  v_year     INT;
  v_released BOOLEAN := false;
BEGIN
  SELECT c.id, c.sample_id, c.certificate_number, c.created_at,
         s.client_id, s.laboratory_id, s.split_numbering
    INTO v_cert
  FROM certificates c
  JOIN samples s ON s.id = c.sample_id
  WHERE c.id = p_certificate_id AND c.voided_at IS NULL
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_seq  := certificate_number_sequence(v_cert.certificate_number);
  v_year := EXTRACT(YEAR FROM v_cert.created_at)::INT;

  IF COALESCE(v_cert.split_numbering, false)
     AND v_seq IS NOT NULL
     AND v_cert.client_id IS NOT NULL
     AND v_cert.laboratory_id IS NOT NULL
     AND v_year = EXTRACT(YEAR FROM NOW())::INT
     -- Never sent by email ...
     AND NOT EXISTS (
       SELECT 1 FROM email_messages em
       WHERE em.status = 'sent' AND em.metadata->>'sample_id' = v_cert.sample_id::text
     )
     -- ... nor recorded as sent, nor opened from the public QR link.
     AND NOT EXISTS (
       SELECT 1 FROM sample_events ev
       WHERE ev.sample_id = v_cert.sample_id
         AND (ev.event_type = 'certificate_sent'
              OR (ev.event_type = 'certificate_downloaded' AND ev.actor_user_id IS NULL))
     )
  THEN
    INSERT INTO certificate_number_pool (client_id, laboratory_id, year, sequence, certificate_id)
    VALUES (v_cert.client_id, v_cert.laboratory_id, v_year, v_seq, v_cert.id)
    ON CONFLICT DO NOTHING;
    v_released := true;
  END IF;

  UPDATE certificates
  SET voided_at = now(),
      voided_number = certificate_number,
      certificate_number = CASE WHEN v_released
        THEN certificate_number || ' VOID-' || left(id::text, 8)
        ELSE certificate_number END
  WHERE id = v_cert.id;

  RETURN v_released;
END;
$fn$;

-- 8. Deleting a sample voids its certificates ----------------------------------
CREATE OR REPLACE FUNCTION void_certificates_of_deleted_sample()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS trg_void_certificates_of_deleted_sample ON samples;
CREATE TRIGGER trg_void_certificates_of_deleted_sample
  AFTER UPDATE OF deleted_at ON samples
  FOR EACH ROW
  EXECUTE FUNCTION void_certificates_of_deleted_sample();
COMMIT;

-- 9. Backfill: samples already deleted -------------------------------------------
-- Voids their certificates and releases this year's unsent numbers, so the next
-- certificates of each line fill the holes (see database/close_certificate_number_gaps.sql
-- to close them now instead, by renumbering the unsent tail).
SELECT c.id, void_certificate(c.id) AS released
FROM certificates c
JOIN samples s ON s.id = c.sample_id
WHERE s.deleted_at IS NOT NULL AND c.voided_at IS NULL;

-- ----------------------------------------------------------------------------
-- Check (run after applying)
-- ----------------------------------------------------------------------------
-- SELECT co.fantasy_name, p.year, p.sequence, c.voided_number
-- FROM certificate_number_pool p
-- JOIN companies co ON co.id = p.client_id
-- LEFT JOIN certificates c ON c.id = p.certificate_id
-- ORDER BY 1, 2, 3;
