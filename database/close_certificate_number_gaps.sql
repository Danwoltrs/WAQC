-- close_certificate_number_gaps.sql — ops script, NOT a migration.
--
-- Closes a hole in a client's certificate number line NOW, by moving the
-- certificates above the hole down into it. Run it after migration
-- 20260924000000 (which voids the deleted samples' certificates and puts their
-- unsent numbers in certificate_number_pool). Without this script those holes
-- still close, just forward: the next certificates of the line take them.
--
-- Renumbers only when EVERY live certificate above the lowest hole is unsent
-- (no sent email, no certificate_sent event, no public QR download) — a
-- certificate that is out in the world never changes number. If one is sent,
-- the plan comes back empty and nothing changes; the pool fills forward.
--
-- Numbers held by voided-but-sent certificates stay burned and are skipped.
--
-- Usage (Supabase SQL editor), e.g. Dunkin at Santos, 2026-09-23 gap
-- (BR-037406/26 -> BR-037412/26):
--
--   1. Preview — changes nothing:
--        SELECT * FROM close_certificate_number_gap(
--          (SELECT id FROM companies WHERE fantasy_name ILIKE 'Dunkin%' OR name ILIKE 'Dunkin%' LIMIT 1),
--          (SELECT id FROM laboratories WHERE code = 'SANTOS_HQ'),
--          false);
--   2. Apply — same call with true. Returns the same plan, now done.
--   3. Afterwards: DROP FUNCTION close_certificate_number_gap(UUID, UUID, BOOLEAN);
--
-- Run it before anyone sends the renumbered certificates.

CREATE OR REPLACE FUNCTION close_certificate_number_gap(
  p_client_id UUID,
  p_laboratory_id UUID,
  p_apply BOOLEAN DEFAULT false
)
RETURNS TABLE (certificate_id UUID, old_number TEXT, new_number TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_year   INT := EXTRACT(YEAR FROM NOW())::INT;
  v_hole   INT;
  v_target INT;
  v_last   INT;
  v_burned INT[];
  v_sent   INT;
  r        RECORD;
BEGIN
  IF p_client_id IS NULL OR p_laboratory_id IS NULL THEN
    RAISE EXCEPTION 'client and laboratory are required';
  END IF;

  -- Hold the line: no certificate of this client/lab is minted meanwhile.
  PERFORM 1 FROM certificate_sequences
  WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year
  FOR UPDATE;

  SELECT min(sequence) INTO v_hole
  FROM certificate_number_pool
  WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;

  IF v_hole IS NULL THEN
    RETURN;  -- no released number, nothing to close
  END IF;

  -- Every certificate of the line above the hole.
  CREATE TEMP TABLE _line ON COMMIT DROP AS
  SELECT c.id, c.sample_id, c.certificate_number,
         certificate_number_sequence(COALESCE(c.voided_number, c.certificate_number)) AS seq,
         (c.voided_at IS NULL AND s.deleted_at IS NULL) AS live
  FROM certificates c
  JOIN samples s ON s.id = c.sample_id
  WHERE s.client_id = p_client_id
    AND s.laboratory_id = p_laboratory_id
    AND s.split_numbering
    AND EXTRACT(YEAR FROM c.created_at)::INT = v_year
    AND certificate_number_sequence(COALESCE(c.voided_number, c.certificate_number)) > v_hole;

  -- A sent certificate above the hole: renumbering it is not an option.
  SELECT count(*) INTO v_sent
  FROM _line l
  WHERE l.live AND (
    EXISTS (SELECT 1 FROM email_messages em
            WHERE em.status = 'sent' AND em.metadata->>'sample_id' = l.sample_id::text)
    OR EXISTS (SELECT 1 FROM sample_events ev
               WHERE ev.sample_id = l.sample_id
                 AND (ev.event_type = 'certificate_sent'
                      OR (ev.event_type = 'certificate_downloaded' AND ev.actor_user_id IS NULL))));
  IF v_sent > 0 THEN
    RAISE NOTICE '% certificate(s) above % already sent — not renumbering; the pool fills forward.', v_sent, v_hole;
    DROP TABLE _line;
    RETURN;
  END IF;

  -- Numbers still held by voided certificates that were sent (never released).
  SELECT COALESCE(array_agg(l.seq), '{}') INTO v_burned
  FROM _line l
  WHERE NOT l.live AND l.certificate_number NOT LIKE '% VOID-%';

  v_target := v_hole;
  v_last   := v_hole - 1;
  FOR r IN SELECT * FROM _line WHERE live ORDER BY seq LOOP
    WHILE v_target = ANY (v_burned) LOOP
      v_target := v_target + 1;
    END LOOP;

    certificate_id := r.id;
    old_number     := r.certificate_number;
    -- Same prefix, suffix, padding and year; only the digits move.
    new_number     := regexp_replace(
      r.certificate_number, '^(\D*)(\d+)(\D*/\d{2,4})$',
      '\1' || lpad(v_target::text, length(substring(r.certificate_number FROM '^\D*(\d+)')), '0') || '\3');
    v_last := v_target;
    v_target := v_target + 1;

    IF p_apply AND new_number <> old_number THEN
      UPDATE certificates SET certificate_number = new_number WHERE id = r.id;
      INSERT INTO sample_events (sample_id, certificate_id, event_type, metadata)
      VALUES (r.sample_id, r.id, 'certificate_renumbered',
              jsonb_build_object('from', old_number, 'to', new_number, 'reason', 'closed a gap left by deleted samples'));
    END IF;
    RETURN NEXT;
  END LOOP;

  IF p_apply THEN
    -- Everything from the hole up is now used or burned.
    DELETE FROM certificate_number_pool
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id
      AND year = v_year AND sequence >= v_hole;
    UPDATE certificate_sequences
    SET last_sequence = GREATEST(v_last, COALESCE((SELECT max(b) FROM unnest(v_burned) b), v_last))
    WHERE client_id = p_client_id AND laboratory_id = p_laboratory_id AND year = v_year;
  END IF;

  DROP TABLE _line;
END;
$fn$;
