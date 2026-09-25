-- Migration 20260925000002: recycle unsent certificate numbers — PART 2 of 5
-- The helpers, the voiding, and minting through the pool.
-- Needs part 1. generate_certificate_number() is NOT touched: mint calls the
-- live one (5-arg, or the 6-arg left by the 2026-09-25 editor run).

-- The sequence inside a formatted number: [non-digit prefix]DIGITS[non-digit
-- suffix]/YY(YY). NULL for anything else (e.g. a " VOID-" suffixed number).
CREATE OR REPLACE FUNCTION certificate_number_sequence(p_number TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (substring(p_number FROM '^\D*(\d+)\D*/\d{2,4}$'))::INT
$$;

-- Did this sample's certificate leave the lab? Sent by email, or opened by the
-- client (public QR link, portal). A lab user's own download does not count.
CREATE OR REPLACE FUNCTION certificate_reached_client(p_sample_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM email_messages em
           WHERE em.status = 'sent' AND em.metadata->>'sample_id' = p_sample_id::text)
      OR EXISTS (
           SELECT 1 FROM sample_events ev
           WHERE ev.sample_id = p_sample_id
             AND (ev.event_type = 'certificate_sent'
                  OR (ev.event_type = 'certificate_downloaded'
                      AND (ev.actor_user_id IS NULL OR ev.metadata->>'channel' IN ('public', 'portal')))))
$$;

-- Void one certificate. Its number goes back to the line only when it never
-- reached the client and no live certificate of the line holds that sequence;
-- otherwise the number stays burned. Returns true when the number was released.
CREATE OR REPLACE FUNCTION void_certificate(p_certificate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert RECORD;
  v_seq  INT;
  v_year INT;
BEGIN
  -- At most one row, read by the loop: no select-with-target (see part 1).
  FOR v_cert IN
    SELECT c.id, c.sample_id, c.certificate_number, c.created_at,
           s.client_id, s.laboratory_id, s.split_numbering
    FROM certificates c
    JOIN samples s ON s.id = c.sample_id
    WHERE c.id = p_certificate_id AND c.voided_at IS NULL
    FOR UPDATE OF c
  LOOP
    v_seq  := certificate_number_sequence(v_cert.certificate_number);
    v_year := EXTRACT(YEAR FROM v_cert.created_at)::INT;

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
$$;
-- Called only by the samples trigger (part 4) and the backfill. Functions in
-- public are executable by the API roles by default: without this, any
-- signed-in user could void any certificate through /rest/v1/rpc.
REVOKE ALL ON FUNCTION void_certificate(UUID) FROM PUBLIC, anon, authenticated;

-- The next number of a line: its lowest released number first, else a new one.
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
AS $$
DECLARE
  v_year   INT := EXTRACT(YEAR FROM NOW())::INT;
  v_last   INT;
  v_seq    INT;
  v_number TEXT;
BEGIN
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
$$;
