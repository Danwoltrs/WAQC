-- Migration 131: Atomic certificate sequence numbers
-- Replaces COUNT-based sequence in generate_certificate_number() with
-- an atomic INSERT ON CONFLICT DO UPDATE using a dedicated sequences table.
-- This prevents duplicate certificate numbers under concurrent inserts.

-- ========================================
-- 1. Create certificate_sequences table
-- ========================================

CREATE TABLE IF NOT EXISTS certificate_sequences (
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year INT NOT NULL,
    last_sequence INT NOT NULL DEFAULT 0,
    PRIMARY KEY (client_id, year)
);

-- RLS: only service role / server-side can touch this table
ALTER TABLE certificate_sequences ENABLE ROW LEVEL SECURITY;

-- Allow the DB function (runs as SECURITY DEFINER or via service role) to manage sequences
-- No user-facing RLS policies needed since this table is only accessed through the function

-- ========================================
-- 2. Seed from existing certificates
-- ========================================

-- For each (client_id, year) pair, set last_sequence = COUNT of existing certs
-- This ensures continuity with already-issued certificate numbers.
-- last_sequence must equal starting_sequence + COUNT - 1 so that the
-- next UPSERT (which does +1) produces starting_sequence + COUNT,
-- matching the old COUNT-based function's output.
INSERT INTO certificate_sequences (client_id, year, last_sequence)
SELECT
    s.client_id,
    EXTRACT(YEAR FROM c.created_at)::INT AS year,
    COUNT(*)::INT
      + COALESCE((cl.certificate_pattern->>'starting_sequence')::INT, 1)
      - 1 AS last_sequence
FROM certificates c
INNER JOIN samples s ON c.sample_id = s.id
INNER JOIN clients cl ON s.client_id = cl.id
WHERE s.client_id IS NOT NULL
GROUP BY s.client_id, EXTRACT(YEAR FROM c.created_at)::INT, cl.certificate_pattern
ON CONFLICT (client_id, year) DO UPDATE
    SET last_sequence = GREATEST(certificate_sequences.last_sequence, EXCLUDED.last_sequence);

-- ========================================
-- 3. Rewrite generate_certificate_number()
-- ========================================

-- Drop old versions (3-param and 4-param)
DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS generate_certificate_number(UUID, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION generate_certificate_number(
    p_client_id UUID,
    p_origin TEXT DEFAULT NULL,
    p_quality_spec_id UUID DEFAULT NULL,
    p_is_rejected BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_pattern JSONB;
    v_has_quality BOOLEAN;
    v_quality_position TEXT;
    v_has_origin BOOLEAN;
    v_origin_position TEXT;
    v_padding INT;
    v_starting_seq INT;
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
    -- Get client's certificate pattern
    SELECT certificate_pattern INTO v_pattern
    FROM clients
    WHERE id = p_client_id;

    -- If no pattern, use default
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

    -- Extract configuration
    v_has_quality := COALESCE((v_pattern->>'has_quality_code')::boolean, false);
    v_quality_position := COALESCE(v_pattern->>'quality_position', 'prefix');
    v_has_origin := COALESCE((v_pattern->>'has_origin_code')::boolean, false);
    v_origin_position := COALESCE(v_pattern->>'origin_position', 'prefix');
    v_padding := COALESCE((v_pattern->>'sequence_padding')::int, 6);
    v_starting_seq := COALESCE((v_pattern->>'starting_sequence')::int, 1);
    v_year_format := COALESCE(v_pattern->>'year_format', 'YY');
    v_separator := COALESCE(v_pattern->>'separator', '-');
    v_rejected_prefix := COALESCE(v_pattern->>'rejected_prefix', 'R-');

    -- Current year as integer
    v_year_int := EXTRACT(YEAR FROM NOW())::INT;

    -- =============================================
    -- ATOMIC sequence increment using UPSERT
    -- Two concurrent calls for the same client+year
    -- will serialize on the row lock and each get
    -- a unique, sequential number.
    -- =============================================
    INSERT INTO certificate_sequences (client_id, year, last_sequence)
    VALUES (p_client_id, v_year_int, v_starting_seq)
    ON CONFLICT (client_id, year)
    DO UPDATE SET last_sequence = certificate_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_sequence;

    -- Format year
    IF v_year_format = 'YYYY' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
    ELSE
        v_year := TO_CHAR(NOW(), 'YY');
    END IF;

    -- Get quality code if needed
    IF v_has_quality AND p_quality_spec_id IS NOT NULL THEN
        SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2), 'QC'))
        INTO v_quality_code
        FROM client_qualities
        WHERE id = p_quality_spec_id
        LIMIT 1;

        v_quality_code := COALESCE(v_quality_code, 'QC');
    END IF;

    -- Get origin code if needed
    IF v_has_origin AND p_origin IS NOT NULL THEN
        SELECT country_code INTO v_origin_code
        FROM country_codes
        WHERE country_name ILIKE p_origin
        LIMIT 1;

        v_origin_code := COALESCE(v_origin_code, UPPER(SUBSTRING(p_origin FROM 1 FOR 2)));
    END IF;

    -- Build prefix
    IF v_has_quality AND v_quality_position = 'prefix' THEN
        v_prefix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'prefix' THEN
        v_prefix := v_origin_code;
    END IF;

    -- Build suffix
    IF v_has_quality AND v_quality_position = 'suffix' THEN
        v_suffix := v_quality_code;
    ELSIF v_has_origin AND v_origin_position = 'suffix' THEN
        v_suffix := v_origin_code;
    END IF;

    -- Add rejected prefix if sample is rejected
    IF p_is_rejected THEN
        v_result := v_rejected_prefix;
    END IF;

    -- Build certificate number
    IF v_prefix != '' THEN
        v_result := v_result || v_prefix || v_separator;
    END IF;

    v_result := v_result || LPAD(v_sequence::TEXT, v_padding, '0');

    IF v_suffix != '' THEN
        v_result := v_result || v_separator || v_suffix;
    END IF;

    -- Always append year at the end with /
    v_result := v_result || '/' || v_year;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION generate_certificate_number IS 'Generate certificate number with atomic sequence. Uses certificate_sequences table for concurrency-safe, per-client, per-year sequence numbers. Supports rejected prefix, quality/origin codes, custom padding, and year formatting.';

-- ========================================
-- 4. Grant access for the function to work
-- ========================================

-- The function needs to read/write certificate_sequences
-- Since it runs in the context of the calling user, we need a policy
-- that allows authenticated users to interact via the function.
-- We use SECURITY DEFINER to run with the function owner's privileges.

ALTER FUNCTION generate_certificate_number(UUID, TEXT, UUID, BOOLEAN) SECURITY DEFINER;

-- ========================================
-- 5. Verification
-- ========================================

DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM certificate_sequences;
    RAISE NOTICE 'Migration 131: certificate_sequences table created and seeded with % rows', v_count;
END;
$$;

SELECT 'Migration 131: Atomic certificate sequences - complete' AS status;
