-- Check all Blaser samples in the database
-- This will help us understand why the sequence is at 045891

-- 1. Get Blaser's client_id
SELECT
    'Blaser Client Info' as check_type,
    id,
    name,
    company,
    tracking_number_format->>'starting_sequence' as global_starting_seq
FROM clients
WHERE name ILIKE '%blaser%';

-- 2. Check ALL samples for Blaser (including any that might not be visible in UI)
SELECT
    'All Blaser Samples' as check_type,
    id,
    tracking_number,
    sample_type,
    quality_name,
    CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER) as extracted_sequence,
    client_id,
    laboratory_id,
    status,
    created_at,
    updated_at
FROM samples
WHERE client_id IN (SELECT id FROM clients WHERE name ILIKE '%blaser%')
ORDER BY created_at DESC;

-- 3. Check for any samples with tracking numbers in the BD-045XXX range
SELECT
    'Samples in BD-045XXX range' as check_type,
    id,
    tracking_number,
    sample_type,
    quality_name,
    client_id,
    (SELECT name FROM clients WHERE id = samples.client_id) as client_name,
    created_at
FROM samples
WHERE tracking_number LIKE 'BD-045%'
ORDER BY created_at DESC;

-- 4. Check the current max sequence for Blaser at Santos lab
SELECT
    'Max Sequence Calculation' as check_type,
    MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)) as max_sequence,
    COUNT(*) as total_samples,
    array_agg(tracking_number ORDER BY created_at DESC) FILTER (WHERE tracking_number LIKE 'BD-%') as recent_bd_numbers
FROM samples
WHERE client_id IN (SELECT id FROM clients WHERE name ILIKE '%blaser%')
  AND laboratory_id IN (SELECT id FROM laboratories WHERE name ILIKE '%santos%');
