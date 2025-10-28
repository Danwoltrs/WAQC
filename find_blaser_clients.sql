-- Find all clients that match "Blaser" search
SELECT
    id,
    name,
    company,
    fantasy_name,
    client_types,
    qc_enabled,
    tracking_number_format->>'starting_sequence' as starting_sequence,
    created_at
FROM clients
WHERE
    LOWER(company) LIKE '%blaser%'
    OR LOWER(name) LIKE '%blaser%'
    OR LOWER(fantasy_name) LIKE '%blaser%'
ORDER BY created_at;
