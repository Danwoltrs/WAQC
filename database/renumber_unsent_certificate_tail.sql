-- renumber_unsent_certificate_tail.sql — ops script, NOT a migration.
--
-- Closes the holes in one client's certificate number line NOW: every live
-- certificate above the lowest released number moves down to fill the holes, in
-- order. Run it after parts 1-5 (20260925000001..5): the backfill is what
-- releases the numbers. Without this script the holes still close, forward:
-- the next certificates of the line take them.
--
-- Refuses, changing nothing, when a certificate above the hole already reached
-- the client (sent by email, or opened from the QR link or the portal): a
-- number that is out in the world never changes. It then names them.
-- A number that stays taken (a voided certificate that reached the client, or
-- one this script does not move) is skipped, never reused.
--
-- A contract sibling's sys rows (shipment_samples) carry its certificate
-- number as waqc_ref; those rows follow the new number, on the certificate's
-- own contract only.
--
-- Usage in the Supabase SQL editor, each step on its own:
--   1. Run this whole file. It only creates the function.
--   2. Preview, changes nothing:
--        SELECT * FROM renumber_unsent_certificate_tail('Dunkin%', 'SANTOS_HQ', false);
--   3. Apply: the same call with true. Returns the same plan, now done.
--   4. DROP FUNCTION renumber_unsent_certificate_tail(TEXT, TEXT, BOOLEAN);
-- Run it before anyone sends the renumbered certificates.

CREATE OR REPLACE FUNCTION renumber_unsent_certificate_tail(
  p_client_name TEXT,
  p_lab_code TEXT,
  p_apply BOOLEAN DEFAULT false
)
RETURNS TABLE (sample_nr TEXT, number_now TEXT, number_new TEXT, sys_rows INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    INT := EXTRACT(YEAR FROM NOW())::INT;
  v_lab     UUID;
  v_client  UUID;
  v_matches TEXT;
  v_hole    INT;
  v_target  INT;
  v_last    INT;
  v_top     INT;
  v_taken   INT[] := '{}';
  v_problem TEXT;
  v_shape   TEXT;
  r         RECORD;
BEGIN
  v_lab := (SELECT id FROM laboratories WHERE code = p_lab_code);
  -- The client: the one company matching the name with a line at this lab this year.
  v_matches := (SELECT string_agg(COALESCE(co.fantasy_name, co.name), ', ')
                FROM companies co JOIN certificate_sequences cs ON cs.client_id = co.id
                WHERE (co.fantasy_name ILIKE p_client_name OR co.name ILIKE p_client_name)
                  AND cs.laboratory_id = v_lab AND cs.year = v_year);
  v_client := (SELECT CASE WHEN count(*) = 1 THEN (array_agg(co.id))[1] END
               FROM companies co JOIN certificate_sequences cs ON cs.client_id = co.id
               WHERE (co.fantasy_name ILIKE p_client_name OR co.name ILIKE p_client_name)
                 AND cs.laboratory_id = v_lab AND cs.year = v_year);
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Need exactly one client matching "%" with a % line in %; found: %',
      p_client_name, p_lab_code, v_year, COALESCE(v_matches, 'none');
  END IF;

  -- Hold the line: nothing of this client and lab is minted meanwhile.
  PERFORM 1 FROM certificate_sequences
  WHERE client_id = v_client AND laboratory_id = v_lab AND year = v_year
  FOR UPDATE;

  v_hole := (SELECT min(sequence) FROM certificate_number_pool
             WHERE client_id = v_client AND laboratory_id = v_lab AND year = v_year);
  IF v_hole IS NULL THEN
    RETURN;  -- nothing released: no hole to close
  END IF;
  v_target := v_hole;
  v_last   := v_hole - 1;
  -- The line's number shape ("BR-#/26"), to find any other certificate of the
  -- client that would collide once the counter goes down.
  v_shape := (SELECT regexp_replace(regexp_replace(COALESCE(c.voided_number, c.certificate_number), '^R-', ''),
                                    '^(\D*)\d+(\D*/\d{2,4})$', '\1#\2')
              FROM certificates c JOIN samples s ON s.id = c.sample_id
              WHERE s.client_id = v_client AND s.laboratory_id = v_lab AND s.split_numbering
                AND EXTRACT(YEAR FROM c.created_at)::INT = v_year
              ORDER BY c.created_at DESC
              LIMIT 1);

  -- Every certificate above the hole, in number order. Ascending moves never
  -- collide: a certificate only ever moves down onto a number already freed.
  FOR r IN
    SELECT c.id, c.sample_id, s.tracking_number, s.contract_id, c.certificate_number,
           certificate_number_sequence(COALESCE(c.voided_number, c.certificate_number)) AS seq,
           (c.voided_at IS NULL AND s.deleted_at IS NULL) AS live,
           (c.voided_at IS NULL AND s.deleted_at IS NOT NULL) AS unvoided,
           (c.certificate_number LIKE '% VOID-%') AS released,
           (s.client_id = v_client AND s.split_numbering) AS movable
    FROM certificates c
    JOIN samples s ON s.id = c.sample_id
    WHERE s.laboratory_id = v_lab
      AND (s.client_id = v_client OR c.client_id = v_client)
      AND EXTRACT(YEAR FROM c.created_at)::INT = v_year
      AND certificate_number_sequence(COALESCE(c.voided_number, c.certificate_number)) > v_hole
    ORDER BY 6, 1
  LOOP
    IF r.released THEN
      CONTINUE;
    ELSIF r.unvoided THEN
      v_problem := concat_ws('; ', v_problem, r.certificate_number || ' is on a deleted sample (run part 5 first)');
      v_taken := v_taken || r.seq;
    ELSIF r.live AND r.movable AND certificate_reached_client(r.sample_id) THEN
      v_problem := concat_ws('; ', v_problem, r.certificate_number || ' already reached the client');
      v_taken := v_taken || r.seq;
    ELSIF r.live AND r.movable THEN
      WHILE v_target = ANY (v_taken) LOOP
        v_target := v_target + 1;
      END LOOP;
      sample_nr  := r.tracking_number;
      number_now := r.certificate_number;
      -- Same prefix, padding, suffix and year; only the digits move.
      number_new := regexp_replace(r.certificate_number, '^(\D*)(\d+)(\D*/\d{2,4})$',
        '\1' || lpad(v_target::text, length(substring(r.certificate_number FROM '^\D*(\d+)')), '0') || '\3');
      sys_rows := (SELECT count(*) FROM shipment_samples
                   WHERE waqc_ref = regexp_replace(r.certificate_number, '^R-', '')
                     AND contract_id = r.contract_id);
      IF p_apply AND number_new <> number_now THEN
        UPDATE certificates SET certificate_number = number_new, pdf_url = NULL WHERE id = r.id;
        UPDATE shipment_samples SET waqc_ref = regexp_replace(number_new, '^R-', '')
        WHERE waqc_ref = regexp_replace(number_now, '^R-', '') AND contract_id = r.contract_id;
        INSERT INTO sample_events (sample_id, certificate_id, event_type, metadata)
        VALUES (r.sample_id, r.id, 'certificate_renumbered',
                jsonb_build_object('from', number_now, 'to', number_new,
                                   'reason', 'closed a gap left by deleted samples'));
      END IF;
      v_last   := v_target;
      v_target := v_target + 1;
      RETURN NEXT;
    ELSE
      -- Stays where it is: a burned number, or a certificate this script does not move.
      v_taken := v_taken || r.seq;
    END IF;
  END LOOP;

  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Not renumbering: %', v_problem;  -- also undoes any move above
  END IF;

  -- The counter ends at the highest number still taken; the free numbers under
  -- it go back to the pool, so the next certificates fill them first.
  v_top := GREATEST(v_last, (SELECT max(t) FROM unnest(v_taken) t));
  -- After the moves above (apply) every number of the line over v_top is free,
  -- unless a certificate outside the line (another lab, same format) holds one.
  IF EXISTS (
    SELECT 1 FROM certificates c
    WHERE c.client_id = v_client
      AND regexp_replace(regexp_replace(c.certificate_number, '^R-', ''), '^(\D*)\d+(\D*/\d{2,4})$', '\1#\2') = v_shape
      AND certificate_number_sequence(c.certificate_number) > v_top
      AND NOT (p_apply = false AND c.id IN (
        SELECT c2.id FROM certificates c2 JOIN samples s2 ON s2.id = c2.sample_id
        WHERE s2.client_id = v_client AND s2.laboratory_id = v_lab AND s2.split_numbering
          AND c2.voided_at IS NULL AND s2.deleted_at IS NULL
          AND EXTRACT(YEAR FROM c2.created_at)::INT = v_year))
  ) THEN
    RAISE EXCEPTION 'Not renumbering: another certificate of this client (other lab?) holds a number above %', v_top;
  END IF;

  IF p_apply THEN
    DELETE FROM certificate_number_pool
    WHERE client_id = v_client AND laboratory_id = v_lab AND year = v_year AND sequence >= v_hole;
    INSERT INTO certificate_number_pool (client_id, laboratory_id, year, sequence)
    SELECT v_client, v_lab, v_year, g
    FROM generate_series(v_last + 1, v_top - 1) g
    WHERE g <> ALL (v_taken);
    UPDATE certificate_sequences SET last_sequence = v_top
    WHERE client_id = v_client AND laboratory_id = v_lab AND year = v_year;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION renumber_unsent_certificate_tail(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
