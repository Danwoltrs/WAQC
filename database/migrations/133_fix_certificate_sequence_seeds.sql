-- Migration 133: Fix certificate_sequences seed values
-- Migration 131 seeded with raw COUNT(*) instead of COUNT + starting_sequence - 1.
-- This corrects the values so the next certificate number continues correctly.

-- Remove any test/accidental rows for years with no real certificates
DELETE FROM certificate_sequences cs
WHERE NOT EXISTS (
    SELECT 1 FROM certificates c
    JOIN samples s ON c.sample_id = s.id
    WHERE s.client_id = cs.client_id
      AND EXTRACT(YEAR FROM c.created_at)::INT = cs.year
);

-- Correct existing rows: last_sequence = COUNT + starting_sequence - 1
UPDATE certificate_sequences cs
SET last_sequence = correction.correct_seq
FROM (
    SELECT
        s.client_id,
        EXTRACT(YEAR FROM c.created_at)::INT AS yr,
        COUNT(*)::INT
          + COALESCE((cl.certificate_pattern->>'starting_sequence')::INT, 1)
          - 1 AS correct_seq
    FROM certificates c
    INNER JOIN samples s ON c.sample_id = s.id
    INNER JOIN clients cl ON s.client_id = cl.id
    WHERE s.client_id IS NOT NULL
    GROUP BY s.client_id, EXTRACT(YEAR FROM c.created_at)::INT, cl.certificate_pattern
) correction
WHERE cs.client_id = correction.client_id
  AND cs.year = correction.yr
  AND cs.last_sequence != correction.correct_seq;

-- Verify
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT cs.*, cl.company
        FROM certificate_sequences cs
        JOIN clients cl ON cs.client_id = cl.id
        ORDER BY cl.company
    LOOP
        RAISE NOTICE 'Fixed: % (%) last_sequence = %', r.company, r.year, r.last_sequence;
    END LOOP;
END;
$$;

SELECT 'Migration 133: Certificate sequence seeds corrected' AS status;
