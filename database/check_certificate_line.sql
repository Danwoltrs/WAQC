-- check_certificate_line.sql — read-only. Run it alone in the Supabase SQL editor.
-- One client's 2026 line at one lab, around a gap: who holds each number, and
-- how each missing one left the list. Set the client, the lab and the first
-- number in the WHERE clause (Dunkin at Santos from BR-037395/26 below).
--
-- how_it_left:
--   minted for an already-deleted row  -> the group-certification bug (a contract
--                                         row deleted BEFORE the lot was certified)
--   deleted after certification        -> a certified sample deleted afterwards

SELECT substring(c.certificate_number FROM '^\D*(\d+)')::INT AS seq,
       c.certificate_number,
       co.fantasy_name AS client,
       s.tracking_number AS sample_nr,
       CASE WHEN s.lab_source_sample_id IS NULL THEN 'lab unit'
            ELSE 'contract #' || COALESCE(s.contract_ordinal::TEXT, '?') || ' of '
                 || (SELECT lu.tracking_number FROM samples lu WHERE lu.id = s.lab_source_sample_id) END AS row_kind,
       s.wolthers_contract_nr AS contract,
       to_char(c.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS certified,
       to_char(s.deleted_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS deleted,
       CASE WHEN s.deleted_at IS NULL THEN ''
            WHEN s.deleted_at < c.created_at THEN 'minted for an already-deleted row'
            ELSE 'deleted after certification' END AS how_it_left,
       concat_ws(' + ',
         CASE WHEN EXISTS (SELECT 1 FROM email_messages em
                           WHERE em.status = 'sent' AND em.metadata->>'sample_id' = s.id::TEXT) THEN 'emailed' END,
         CASE WHEN EXISTS (SELECT 1 FROM sample_events ev
                           WHERE ev.sample_id = s.id AND ev.event_type = 'certificate_sent') THEN 'sent event' END,
         CASE WHEN EXISTS (SELECT 1 FROM sample_events ev
                           WHERE ev.sample_id = s.id AND ev.event_type = 'certificate_downloaded'
                             AND (ev.actor_user_id IS NULL OR ev.metadata->>'channel' IN ('public', 'portal')))
              THEN 'opened by client' END) AS reached_client,
       (SELECT count(*) FROM certificates c2 WHERE c2.sample_id = c.sample_id) AS certs_on_sample,
       (SELECT string_agg(ss.sample_type || ':' || ss.status, ', ') FROM shipment_samples ss
        WHERE ss.waqc_ref = regexp_replace(c.certificate_number, '^R-', '')) AS sys_rows_with_this_number,
       (to_jsonb(c)->>'voided_at') IS NOT NULL AS voided,
       (SELECT cs.last_sequence FROM certificate_sequences cs
        WHERE cs.client_id = s.client_id AND cs.laboratory_id = s.laboratory_id
          AND cs.year = EXTRACT(YEAR FROM c.created_at)::INT) AS counter_now
FROM certificates c
JOIN samples s       ON s.id = c.sample_id
JOIN companies co    ON co.id = s.client_id
JOIN laboratories l  ON l.id = s.laboratory_id
WHERE (co.fantasy_name ILIKE 'Dunkin%' OR co.name ILIKE 'Dunkin%')
  AND l.code = 'SANTOS_HQ'
  AND c.created_at >= '2026-01-01'
  AND substring(c.certificate_number FROM '^\D*(\d+)')::INT >= 37395
ORDER BY 1, c.created_at;
