-- Check for type samples without client_id and their tracking numbers
SELECT
    id,
    tracking_number,
    sample_type,
    client_id,
    laboratory_id,
    origin,
    quality_name,
    created_at,
    status
FROM samples
WHERE sample_type = 'type'
  AND client_id IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- Check for any duplicate tracking numbers
SELECT
    tracking_number,
    COUNT(*) as count
FROM samples
GROUP BY tracking_number
HAVING COUNT(*) > 1;

-- Check the current max sequence for type samples without client at your lab
-- Replace 'YOUR_LAB_ID' with your actual laboratory UUID
SELECT
    MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)) as max_sequence,
    COUNT(*) as total_samples
FROM samples
WHERE client_id IS NULL
  -- AND laboratory_id = 'YOUR_LAB_ID'  -- Uncomment and add your lab ID
;
