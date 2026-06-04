-- Migration 20260604000001: Re-sync certificate_sequences to the true max in use
--
-- WHY: Sub-contracts used to be numbered by an in-app "scan for the max tracking
-- number and +1" routine that NEVER advanced the atomic certificate_sequences
-- counter. So for any client+lab that has sub-contracts, the counter drifted
-- BEHIND the numbers actually in use. Example found in prod (Ahold / Santos / 2026):
--   certificate_sequences.last_sequence = 11692
--   but tracking numbers in use run 11692 .. 11701 (mother + 9 sub-contracts)
-- The next generate_certificate_number() call returns 11693, which collides with
-- an existing number -> intake retries (max 5) can't clear a 9-wide gap -> the
-- next sample fails or "jumps". The sub-contract route now draws from this same
-- atomic counter (app fix), so this migration just heals the existing drift.
--
-- WHAT: For every (client_id, laboratory_id, year), set last_sequence to the
-- highest sequence number actually used across samples + sample_contracts.
-- Uses GREATEST so the counter is only ever raised, never lowered (safe to re-run).
--
-- ORDER: apply this AFTER deploying the app change that makes sub-contract
-- creation call generate_certificate_number (src/app/api/samples/[id]/contracts).
-- Otherwise sub-contracts created in the gap would re-introduce drift.

-- ----------------------------------------------------------------------------
-- DIAGNOSTIC (optional): run this SELECT first to see the drift before fixing.
-- ----------------------------------------------------------------------------
-- WITH tn AS (
--   SELECT s.client_id, s.laboratory_id, s.tracking_number AS t
--   FROM samples s
--   WHERE s.client_id IS NOT NULL AND s.laboratory_id IS NOT NULL AND s.tracking_number IS NOT NULL
--   UNION ALL
--   SELECT s.client_id, s.laboratory_id, sc.tracking_number
--   FROM sample_contracts sc JOIN samples s ON s.id = sc.sample_id
--   WHERE s.client_id IS NOT NULL AND s.laboratory_id IS NOT NULL AND sc.tracking_number IS NOT NULL
-- ),
-- parsed AS (
--   SELECT client_id, laboratory_id,
--     CASE WHEN split_part(t,'/',2) ~ '^[0-9]{4}$' THEN split_part(t,'/',2)::int
--          WHEN split_part(t,'/',2) ~ '^[0-9]{2}$' THEN 2000 + split_part(t,'/',2)::int
--          ELSE NULL END AS year,
--     NULLIF(substring(split_part(t,'/',1) FROM '([0-9]+)$'), '')::int AS seq
--   FROM tn
-- ),
-- observed AS (
--   SELECT client_id, laboratory_id, year, MAX(seq) AS max_used
--   FROM parsed WHERE year IS NOT NULL AND seq IS NOT NULL
--   GROUP BY client_id, laboratory_id, year
-- )
-- SELECT comp.name AS client, lab.name AS lab, o.year,
--        cs.last_sequence AS counter, o.max_used,
--        o.max_used - COALESCE(cs.last_sequence, 0) AS drift
-- FROM observed o
-- LEFT JOIN certificate_sequences cs
--   ON cs.client_id = o.client_id AND cs.laboratory_id = o.laboratory_id AND cs.year = o.year
-- LEFT JOIN companies comp ON comp.id = o.client_id
-- LEFT JOIN laboratories lab ON lab.id = o.laboratory_id
-- WHERE o.max_used > COALESCE(cs.last_sequence, 0)
-- ORDER BY drift DESC;

-- ----------------------------------------------------------------------------
-- FIX
-- ----------------------------------------------------------------------------
BEGIN;

WITH tn AS (
  SELECT s.client_id, s.laboratory_id, s.tracking_number AS t
  FROM samples s
  WHERE s.client_id IS NOT NULL AND s.laboratory_id IS NOT NULL AND s.tracking_number IS NOT NULL
  UNION ALL
  SELECT s.client_id, s.laboratory_id, sc.tracking_number
  FROM sample_contracts sc
  JOIN samples s ON s.id = sc.sample_id
  WHERE s.client_id IS NOT NULL AND s.laboratory_id IS NOT NULL AND sc.tracking_number IS NOT NULL
),
parsed AS (
  SELECT
    client_id,
    laboratory_id,
    -- Year from the "/YY" or "/YYYY" suffix of the tracking number.
    CASE
      WHEN split_part(t, '/', 2) ~ '^[0-9]{4}$' THEN split_part(t, '/', 2)::int
      WHEN split_part(t, '/', 2) ~ '^[0-9]{2}$' THEN 2000 + split_part(t, '/', 2)::int
      ELSE NULL
    END AS year,
    -- Sequence = the trailing digit run before the "/" (handles digit-bearing
    -- prefixes like "AD1-890239" -> 890239). Suffix-coded numbers yield NULL and
    -- are skipped; GREATEST below leaves their counter untouched.
    NULLIF(substring(split_part(t, '/', 1) FROM '([0-9]+)$'), '')::int AS seq
  FROM tn
),
observed AS (
  SELECT client_id, laboratory_id, year, MAX(seq) AS max_used
  FROM parsed
  WHERE year IS NOT NULL AND seq IS NOT NULL
  GROUP BY client_id, laboratory_id, year
)
INSERT INTO certificate_sequences (client_id, laboratory_id, year, last_sequence)
SELECT client_id, laboratory_id, year, max_used
FROM observed
ON CONFLICT (client_id, laboratory_id, year)
DO UPDATE SET last_sequence = GREATEST(certificate_sequences.last_sequence, EXCLUDED.last_sequence);

COMMIT;
