-- Migration 20260925000005: recycle unsent certificate numbers — PART 5 of 5
-- Backfill: void the certificates of samples deleted before part 4.
-- Needs parts 1-4. Lists every certificate it voided; "released" = true means
-- the number went back to its line (this year's, never reached the client,
-- not held by a live certificate). Safe to re-run: a voided one is skipped.
--
-- The released numbers are taken by the next certificates of each line. To
-- close a hole right away instead, run database/renumber_unsent_certificate_tail.sql.

SELECT co.fantasy_name AS client,
       s.tracking_number AS sample_nr,
       c.certificate_number,
       void_certificate(c.id) AS released
FROM certificates c
JOIN samples s ON s.id = c.sample_id
LEFT JOIN companies co ON co.id = s.client_id
WHERE s.deleted_at IS NOT NULL
  AND c.voided_at IS NULL
ORDER BY 1, 3;
