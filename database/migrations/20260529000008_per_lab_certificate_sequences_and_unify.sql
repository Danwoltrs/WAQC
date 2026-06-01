-- Migration 20260529000008: Per-lab certificate sequences + unify tracking = cert
--
-- GOAL (confirmed with product): one number per (company, laboratory, year),
-- used as BOTH the sample tracking number and its certificate number.
--   * Per-lab: Colombia lab runs its own sequence, independent of Santos.
--   * Continues the existing certificate line per lab (Dunkin Santos -> 36991).
--   * Each quality keeps its own prefix (driven by client_qualities.quality_code).
--   * Existing + in-progress samples are NOT renumbered (their certs, when issued,
--     reuse their existing tracking_number).
--
-- This migration is the DB half (Step 1 of 3):
--   1. certificate_sequences becomes keyed on (client_id, laboratory_id, year).
--   2. Re-seed it from existing certificates, per (client, lab, year), so each
--      lab continues from its current max certificate number.
--   3. Rewrite generate_certificate_number() to take p_laboratory_id, increment
--      the per-lab counter, and seed new (client, lab) pairs from
--      client_laboratory_config (the "LAB SEQUENCES" overrides) or the pattern.
--   4. Rewrite the approval trigger to set certificate_number = NEW.tracking_number
--      (no second number generated). This makes the DB side self-consistent
--      immediately; the cert API / cupping-finalize routes are updated in the
--      app-code half (Steps 2-3).
--
-- DEPLOY NOTE: apply this, sanity-check the seeded counters (query at the end),
-- then deploy the app-code changes. Between apply and deploy, auto-cert-on-
-- approval (the trigger) already reuses tracking_number safely; only the manual
-- "generate certificate" API button would error in that window because the old
-- code calls the generator without a laboratory_id. Deploy code promptly.

BEGIN;

-- ========================================
-- 1. certificate_sequences -> per (client, laboratory, year)
-- ========================================
-- Existing rows are keyed (client_id, year) with no lab and can't be reliably
-- split per-lab, so we drop them and re-seed from the certificates themselves
-- (the source of truth). Safe: seeding below reproduces the same values per lab.

ALTER TABLE certificate_sequences DROP CONSTRAINT IF EXISTS certificate_sequences_pkey;
ALTER TABLE certificate_sequences ADD COLUMN IF NOT EXISTS laboratory_id UUID;

DELETE FROM certificate_sequences;

ALTER TABLE certificate_sequences
  ALTER COLUMN laboratory_id SET NOT NULL;

ALTER TABLE certificate_sequences
  ADD CONSTRAINT certificate_sequences_laboratory_id_fkey
  FOREIGN KEY (laboratory_id) REFERENCES laboratories(id) ON DELETE CASCADE;

ALTER TABLE certificate_sequences
  ADD CONSTRAINT certificate_sequences_pkey
  PRIMARY KEY (client_id, laboratory_id, year);

-- ========================================
-- 2. Seed from existing certificates, per (client, lab, year)
-- ========================================
-- last_sequence = max numeric sequence parsed from certificate_number for that
-- client+lab+year. certificate_number looks like PREFIX-012345/26 (or with a
-- suffix); the sequence is the digit run in the part before the final '/'.
-- Prefixes are letter codes (quality/origin), so the first digit run is the seq.

INSERT INTO certificate_sequences (client_id, laboratory_id, year, last_sequence)
SELECT
  s.client_id,
  s.laboratory_id,
  EXTRACT(YEAR FROM c.created_at)::INT AS year,
  MAX(
    NULLIF(substring(split_part(c.certificate_number, '/', 1) FROM '[0-9]+'), '')::INT
  ) AS last_sequence
FROM certificates c
JOIN samples s ON s.id = c.sample_id
WHERE s.client_id IS NOT NULL
  AND s.laboratory_id IS NOT NULL
  AND c.certificate_number ~ '[0-9]'
GROUP BY s.client_id, s.laboratory_id, EXTRACT(YEAR FROM c.created_at)::INT
HAVING MAX(NULLIF(substring(split_part(c.certificate_number, '/', 1) FROM '[0-9]+'), '')::INT) IS NOT NULL;

-- ========================================
-- 3. Rewrite generate_certificate_number() -> per-lab
-- ========================================
-- Adds p_laboratory_id (last param, defaulted so 3/4-arg callers still resolve
-- during the deploy window). Pattern is read from qc_client_settings (as set by
-- migration #20260528000007). Seed for a brand-new (client, lab) pair comes from
-- client_laboratory_config (per-lab "LAB SEQUENCES" override) first, then the
-- pattern's starting_sequence, then 1.

DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_spec_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false,
    p_laboratory_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

    -- Pattern from qc_client_settings (company_id = p_client_id)
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

    -- Per-lab starting override ("LAB SEQUENCES") wins over the pattern default.
    -- Only used to seed a brand-new (client, lab, year) row.
    SELECT starting_sequence INTO v_lab_specific_start
    FROM client_laboratory_config
    WHERE client_id = p_client_id
      AND laboratory_id = p_laboratory_id;

    IF v_lab_specific_start IS NOT NULL THEN
        v_starting_seq := v_lab_specific_start;
    END IF;

    v_year_int := EXTRACT(YEAR FROM NOW())::INT;

    -- Atomic per-(client, lab, year) increment.
    INSERT INTO certificate_sequences (client_id, laboratory_id, year, last_sequence)
    VALUES (p_client_id, p_laboratory_id, v_year_int, v_starting_seq)
    ON CONFLICT (client_id, laboratory_id, year)
    DO UPDATE SET last_sequence = certificate_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_sequence;

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
$$;

COMMENT ON FUNCTION generate_certificate_number(UUID, TEXT, UUID, BOOLEAN, UUID) IS
  'Generate a per-(client, laboratory, year) sequence number using the company '
  'certificate_pattern. Used at intake for the unified tracking=cert number. '
  'Seeds new (client, lab) pairs from client_laboratory_config then pattern.';

-- ========================================
-- 4. Approval trigger: certificate_number = sample tracking_number
-- ========================================
-- No second number is generated; the cert reuses the sample's tracking_number
-- (which, going forward, is itself the per-lab cert-sequence number).

CREATE OR REPLACE FUNCTION auto_generate_certificate_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_cert_id UUID;
    v_issued_to TEXT;
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN

        IF NEW.tracking_number IS NULL OR NEW.tracking_number = '' THEN
            RAISE WARNING 'auto_generate_certificate: sample % has no tracking_number, skipping cert', NEW.id;
            RETURN NEW;
        END IF;

        SELECT id INTO v_existing_cert_id
        FROM certificates
        WHERE sample_id = NEW.id
          AND sample_contract_id IS NULL
        LIMIT 1;

        IF v_existing_cert_id IS NULL THEN
            -- issued_to = QC client name (matches the cert API), consolidation-safe.
            SELECT COALESCE(fantasy_name, name, 'Pending')
            INTO v_issued_to
            FROM companies
            WHERE id = NEW.client_id;

            INSERT INTO certificates (
                sample_id,
                certificate_number,
                issued_to,
                status
            ) VALUES (
                NEW.id,
                NEW.tracking_number,           -- unified: cert # = tracking #
                COALESCE(v_issued_to, 'Pending'),
                'issued'
            );

            RAISE NOTICE 'Auto-generated certificate % for sample %', NEW.tracking_number, NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;

-- ========================================
-- Sanity check (run after applying): seeded per-lab counters
-- ========================================
-- SELECT comp.name AS client, lab.name AS lab, cs.year, cs.last_sequence,
--        cs.last_sequence + 1 AS next_number
-- FROM certificate_sequences cs
-- JOIN companies comp ON comp.id = cs.client_id
-- JOIN laboratories lab ON lab.id = cs.laboratory_id
-- ORDER BY comp.name, lab.name, cs.year;
-- Expect: Dunkin Donuts / <Santos lab> / 2026 / 36990 / 36991
