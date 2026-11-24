-- 20261119000004_origin_certificate_numbers.sql
--
-- One certificate number line per origin, shared by every laboratory and client.
--
-- Today a number comes from a line per (client, laboratory, year). That stays
-- for Brazil and for any origin not listed below. For the listed origins a
-- certificate takes the next number of that ORIGIN's line, whoever the client
-- is and whichever laboratory certified it:
--
--     000123-COL/26            the origin line's number, the origin code, the year
--     SAG-000123-COL/26        with the client's quality code in front, for a
--                              client whose own pattern puts one there
--
-- Origins and codes (Daniel, 2026-11-19): Colombia COL, Guatemala GUA,
-- El Salvador EL, Mexico MEX, Peru PE, Nicaragua NIC. Each line starts at 1
-- and restarts each January; both, and the code, are changed on the
-- Laboratories page (the next number is set there so a line continues where
-- the old Excel numbering stopped).
--
-- What does not change:
--   - no existing certificate number: numbers are assigned on INSERT only;
--   - Brazil, and every origin without a line here: mint_certificate_number
--     asks the origin line first, gets NULL, and carries on exactly as before.
--     On 2026-11-19 every sample in the database is Brazil.
--
-- Atomic: every mint of an origin locks that origin's row, so two laboratories
-- certifying at the same moment queue and never take the same number.
-- A number released by void_certificate before it reached anyone goes back to
-- its ORIGIN line (not to the client's line) and is handed out again.
--
-- Safe to run twice.

BEGIN;

SET LOCAL lock_timeout = '3s';

-- ── The lines ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.origin_certificate_sequences (
  -- As samples.origin spells it ('Colombia'); matched without regard to case.
  origin        text PRIMARY KEY CHECK (length(btrim(origin)) > 0),
  code          text NOT NULL CHECK (code ~ '^[A-Z]{1,6}$'),
  -- The number the next certificate of this origin gets.
  next_number   integer NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  -- The year next_number belongs to.
  counter_year  integer NOT NULL DEFAULT (EXTRACT(YEAR FROM now()))::integer,
  resets_yearly boolean NOT NULL DEFAULT true,
  padding       integer NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 10),
  is_active     boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS origin_certificate_sequences_origin_key
  ON public.origin_certificate_sequences (lower(btrim(origin)));
CREATE UNIQUE INDEX IF NOT EXISTS origin_certificate_sequences_code_key
  ON public.origin_certificate_sequences (code);

ALTER TABLE public.origin_certificate_sequences ENABLE ROW LEVEL SECURITY;

-- Lab staff may read the lines. They are changed through the app's own route
-- (global admins only, service role), so there is no write policy.
DROP POLICY IF EXISTS origin_certificate_sequences_staff_select ON public.origin_certificate_sequences;
CREATE POLICY origin_certificate_sequences_staff_select ON public.origin_certificate_sequences
  FOR SELECT TO authenticated
  USING ((SELECT public.waqc_is_staff()));

GRANT SELECT ON public.origin_certificate_sequences TO authenticated;
GRANT ALL ON public.origin_certificate_sequences TO service_role;

-- Numbers released before they reached anyone, waiting to be handed out again.
CREATE TABLE IF NOT EXISTS public.origin_certificate_number_pool (
  origin         text NOT NULL REFERENCES public.origin_certificate_sequences(origin) ON UPDATE CASCADE ON DELETE CASCADE,
  year           integer NOT NULL,
  sequence       integer NOT NULL,
  certificate_id uuid,
  released_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin, year, sequence)
);

-- No policy at all: only the numbering functions (SECURITY DEFINER) and the
-- service role touch the pool.
ALTER TABLE public.origin_certificate_number_pool ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.origin_certificate_number_pool TO service_role;

INSERT INTO public.origin_certificate_sequences (origin, code)
VALUES
  ('Colombia',    'COL'),
  ('Guatemala',   'GUA'),
  ('El Salvador', 'EL'),
  ('Mexico',      'MEX'),
  ('Peru',        'PE'),
  ('Nicaragua',   'NIC')
ON CONFLICT DO NOTHING;

-- ── The next number of an origin's line ────────────────────────────────────
-- NULL when the origin has no active line: the caller then numbers the
-- certificate the old way.
CREATE OR REPLACE FUNCTION public.mint_origin_certificate_number(p_origin text, p_client_id uuid, p_quality_spec_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line    origin_certificate_sequences%ROWTYPE;
  v_year    INT := EXTRACT(YEAR FROM NOW())::INT;
  v_yy      TEXT := TO_CHAR(NOW(), 'YY');
  v_pattern JSONB;
  v_prefix  TEXT := '';
  v_quality TEXT;
  v_seq     INT;
  v_tries   INT := 0;
BEGIN
  IF p_origin IS NULL OR btrim(p_origin) = '' THEN
    RETURN NULL;
  END IF;

  -- Every mint of this origin queues here.
  PERFORM 1 FROM origin_certificate_sequences o
  WHERE lower(btrim(o.origin)) = lower(btrim(p_origin)) AND o.is_active
  FOR UPDATE;
  v_line := (SELECT o FROM origin_certificate_sequences o
             WHERE lower(btrim(o.origin)) = lower(btrim(p_origin)) AND o.is_active);
  IF v_line.origin IS NULL THEN
    RETURN NULL;
  END IF;

  -- A new year: a line that restarts each January goes back to 1.
  IF v_line.counter_year <> v_year THEN
    IF v_line.resets_yearly THEN
      v_line.next_number := 1;
    END IF;
    v_line.counter_year := v_year;
    UPDATE origin_certificate_sequences
    SET next_number = v_line.next_number, counter_year = v_year, updated_at = now()
    WHERE origin = v_line.origin;
  END IF;

  -- The client's quality code in front, when the client's own pattern puts one there.
  IF p_client_id IS NOT NULL THEN
    v_pattern := (SELECT certificate_pattern FROM qc_client_settings WHERE company_id = p_client_id);
  END IF;
  IF p_quality_spec_id IS NOT NULL
     AND COALESCE((v_pattern->>'has_quality_code')::boolean, false)
     AND COALESCE(v_pattern->>'quality_position', 'prefix') = 'prefix'
  THEN
    v_quality := (SELECT UPPER(COALESCE(quality_code, SUBSTRING(custom_name FROM 1 FOR 2)))
                  FROM client_qualities WHERE id = p_quality_spec_id LIMIT 1);
    IF v_quality IS NOT NULL AND btrim(v_quality) <> '' THEN
      v_prefix := v_quality || COALESCE(v_pattern->>'separator', '-');
    END IF;
  END IF;

  LOOP
    -- A released number of this year first, lowest first.
    v_seq := (SELECT min(sequence) FROM origin_certificate_number_pool
              WHERE origin = v_line.origin AND year = v_year AND sequence < v_line.next_number);
    IF v_seq IS NOT NULL THEN
      DELETE FROM origin_certificate_number_pool
      WHERE origin = v_line.origin AND year = v_year AND sequence = v_seq;
    ELSE
      v_seq := v_line.next_number;
      v_line.next_number := v_line.next_number + 1;
      UPDATE origin_certificate_sequences
      SET next_number = v_line.next_number, updated_at = now()
      WHERE origin = v_line.origin;
    END IF;

    -- The number is shared by every client, so it must be free on EVERY
    -- certificate, whatever sits in front of it. (This is also what makes it
    -- safe to set next_number by hand: a number already used is stepped over.)
    IF NOT EXISTS (
      SELECT 1 FROM certificates c
      WHERE c.certificate_number ~ ('(^|[^0-9])0*' || v_seq::text || '-' || v_line.code || '/' || v_yy || '$')
    ) THEN
      RETURN v_prefix
        || CASE WHEN length(v_seq::text) >= v_line.padding THEN v_seq::text
                ELSE lpad(v_seq::text, v_line.padding, '0') END
        || '-' || v_line.code || '/' || v_yy;
    END IF;

    v_tries := v_tries + 1;
    IF v_tries > 100000 THEN
      RAISE EXCEPTION 'no free certificate number found for origin %', v_line.origin;
    END IF;
  END LOOP;
END;
$function$;

-- Default privileges grant EXECUTE to authenticated directly: revoke it by name.
REVOKE ALL ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_origin_certificate_number(text, uuid, uuid) TO service_role;

-- ── mint_certificate_number: ask the origin line first ─────────────────────
-- The body below the first block is the live definition of 2026-11-19, unchanged.
CREATE OR REPLACE FUNCTION public.mint_certificate_number(p_client_id uuid, p_origin text, p_quality_spec_id uuid, p_laboratory_id uuid, p_cert_client_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year   INT := EXTRACT(YEAR FROM NOW())::INT;
  v_last   INT;
  v_seq    INT;
  v_number TEXT;
BEGIN
  -- An origin with its own line numbers its certificates there, for every
  -- client and laboratory. NULL = this origin has none: the client line below.
  v_number := mint_origin_certificate_number(p_origin, p_client_id, p_quality_spec_id);
  IF v_number IS NOT NULL THEN
    RETURN v_number;
  END IF;

  -- Every mint of this line queues on its counter row (generate_certificate_number
  -- locks the same row), so two certifications never take the same number.
  PERFORM 1 FROM certificate_sequences
  WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year
  FOR UPDATE;
  v_last := (SELECT last_sequence FROM certificate_sequences
             WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year);

  LOOP
    v_seq := (SELECT min(sequence) FROM certificate_number_pool
              WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id
                AND year = v_year AND sequence <= v_last);
    EXIT WHEN v_seq IS NULL;

    DELETE FROM certificate_number_pool
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id
      AND year = v_year AND sequence = v_seq;

    -- generate_certificate_number formats the line's next number: point the
    -- counter just below the released one, let it take it, then put it back.
    UPDATE certificate_sequences SET last_sequence = v_seq - 1
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;
    v_number := generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id);
    UPDATE certificate_sequences SET last_sequence = v_last
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;

    -- Never hand out a number this client already holds (its pattern changed
    -- since the number was released, or a rejected copy carries it).
    IF NOT EXISTS (SELECT 1 FROM certificates
                   WHERE client_id = p_cert_client_id
                     AND certificate_number IN (v_number, 'R-' || v_number)) THEN
      RETURN v_number;
    END IF;
  END LOOP;

  RETURN generate_certificate_number(p_client_id, p_origin, p_quality_spec_id, false, p_laboratory_id);
END;
$function$;

-- ── void_certificate: an origin number goes back to its origin line ────────
-- The part after the origin block is the live definition of 2026-11-19, unchanged.
CREATE OR REPLACE FUNCTION public.void_certificate(p_certificate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cert RECORD;
  v_seq  INT;
  v_year INT;
  v_line origin_certificate_sequences%ROWTYPE;
  v_tail TEXT;
BEGIN
  -- At most one row, read by the loop: no select-with-target (see part 1).
  FOR v_cert IN
    SELECT c.id, c.sample_id, c.certificate_number, c.created_at,
           s.client_id, s.laboratory_id, s.split_numbering, s.origin
    FROM certificates c
    JOIN samples s ON s.id = c.sample_id
    WHERE c.id = p_certificate_id AND c.voided_at IS NULL
    FOR UPDATE OF c
  LOOP
    v_year := EXTRACT(YEAR FROM v_cert.created_at)::INT;

    -- A number of an origin line ("…000123-COL/26") belongs to that line, not
    -- to the client's: it is released there, or not at all.
    v_line := (SELECT o FROM origin_certificate_sequences o
               WHERE lower(btrim(o.origin)) = lower(btrim(COALESCE(v_cert.origin, ''))));
    IF v_line.origin IS NOT NULL
       AND v_cert.certificate_number ~ ('(^|[^0-9])[0-9]+-' || v_line.code || '/[0-9]{2,4}$')
    THEN
      v_tail := '-' || v_line.code || '/' || TO_CHAR(v_cert.created_at, 'YY') || '$';
      v_seq  := (substring(v_cert.certificate_number FROM '([0-9]+)-' || v_line.code || '/[0-9]{2,4}$'))::INT;

      IF v_seq IS NOT NULL
         AND v_year = EXTRACT(YEAR FROM NOW())::INT
         AND v_seq < v_line.next_number
         AND NOT certificate_reached_client(v_cert.sample_id)
         AND NOT EXISTS (
           SELECT 1 FROM certificates c2
           WHERE c2.id <> v_cert.id AND c2.voided_at IS NULL
             AND c2.certificate_number ~ ('(^|[^0-9])0*' || v_seq::text || v_tail))
      THEN
        INSERT INTO origin_certificate_number_pool (origin, year, sequence, certificate_id)
        VALUES (v_line.origin, v_year, v_seq, v_cert.id)
        ON CONFLICT DO NOTHING;
        UPDATE certificates
        SET voided_at = now(), voided_number = certificate_number,
            certificate_number = certificate_number || ' VOID-' || left(id::text, 8)
        WHERE id = v_cert.id;
        RETURN true;
      END IF;

      UPDATE certificates SET voided_at = now(), voided_number = certificate_number
      WHERE id = v_cert.id;
      RETURN false;
    END IF;

    v_seq := certificate_number_sequence(v_cert.certificate_number);

    IF COALESCE(v_cert.split_numbering, false)
       AND v_seq IS NOT NULL
       AND v_cert.client_id IS NOT NULL
       AND v_cert.laboratory_id IS NOT NULL
       AND v_year = EXTRACT(YEAR FROM NOW())::INT
       AND NOT certificate_reached_client(v_cert.sample_id)
       AND NOT EXISTS (
         SELECT 1 FROM certificates c2
         JOIN samples s2 ON s2.id = c2.sample_id
         WHERE c2.id <> v_cert.id AND c2.voided_at IS NULL AND s2.deleted_at IS NULL
           AND s2.client_id = v_cert.client_id AND s2.laboratory_id = v_cert.laboratory_id
           AND EXTRACT(YEAR FROM c2.created_at)::INT = v_year
           AND certificate_number_sequence(c2.certificate_number) = v_seq)
    THEN
      INSERT INTO certificate_number_pool (client_id, laboratory_id, year, sequence, certificate_id)
      VALUES (v_cert.client_id, v_cert.laboratory_id, v_year, v_seq, v_cert.id)
      ON CONFLICT DO NOTHING;
      -- The suffix frees the number on the per-client unique index.
      UPDATE certificates
      SET voided_at = now(), voided_number = certificate_number,
          certificate_number = certificate_number || ' VOID-' || left(id::text, 8)
      WHERE id = v_cert.id;
      RETURN true;
    END IF;

    UPDATE certificates SET voided_at = now(), voided_number = certificate_number
    WHERE id = v_cert.id;
    RETURN false;
  END LOOP;
  RETURN false;
END;
$function$;

-- The two replaced functions keep the access they had: the service role only.
REVOKE ALL ON FUNCTION public.mint_certificate_number(uuid, text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_certificate_number(uuid, text, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.void_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_certificate(uuid) TO service_role;

-- ── Checks: abort the whole migration if any of this did not hold ──────────
DO $$
DECLARE
  v_count INT;
  v_text  TEXT;
BEGIN
  v_count := (SELECT count(*) FROM origin_certificate_sequences);
  IF v_count < 6 THEN
    RAISE EXCEPTION 'expected the six origin lines, found %', v_count;
  END IF;

  -- Brazil has no line: its certificates are numbered exactly as before. (The
  -- call returns before it writes anything.)
  v_text := mint_origin_certificate_number('Brazil', NULL, NULL);
  IF v_text IS NOT NULL THEN
    RAISE EXCEPTION 'Brazil must not have an origin line, got %', v_text;
  END IF;

  -- No certificate numbered the old way exists for an origin that now has a
  -- line (one numbered by its line, on a second run, is as it should be).
  v_count := (SELECT count(*) FROM certificates c JOIN samples s ON s.id = c.sample_id
              JOIN origin_certificate_sequences o ON lower(btrim(o.origin)) = lower(btrim(s.origin))
              WHERE c.certificate_number !~ ('-' || o.code || '/[0-9]{2,4}'));
  IF v_count > 0 THEN
    RAISE EXCEPTION '% certificate(s) numbered the old way exist for an origin that now has a line: review before applying', v_count;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.origin_certificate_sequences'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.origin_certificate_number_pool'::regclass) THEN
    RAISE EXCEPTION 'row level security is off on an origin numbering table';
  END IF;
END $$;

COMMIT;

-- The lines as they stand, with the number the next certificate would get.
SELECT origin, code, next_number, counter_year, resets_yearly,
       lpad(next_number::text, padding, '0') || '-' || code || '/' || to_char(now(), 'YY') AS next_certificate
FROM public.origin_certificate_sequences
ORDER BY origin;
