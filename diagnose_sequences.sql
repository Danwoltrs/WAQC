-- Diagnostic script for tracking number sequence issues
-- Run this to understand why sequences are starting at unexpected numbers

-- 1. Check Blaser's global configuration
SELECT
    'Blaser Global Config' as check_type,
    id,
    name,
    tracking_number_format->>'type' as format_type,
    tracking_number_format->>'pattern' as pattern,
    (tracking_number_format->>'starting_sequence')::int as global_starting_sequence,
    (tracking_number_format->>'sequence_padding')::int as padding
FROM clients
WHERE name ILIKE '%blaser%';

-- 2. Check lab-specific overrides for Blaser
SELECT
    'Blaser Lab-Specific Config' as check_type,
    clc.id,
    c.name as client_name,
    l.name as lab_name,
    clc.starting_sequence as lab_starting_sequence,
    clc.notes
FROM client_laboratory_config clc
JOIN clients c ON c.id = clc.client_id
JOIN laboratories l ON l.id = clc.laboratory_id
WHERE c.name ILIKE '%blaser%';

-- 3. Check all existing Blaser samples (even deleted ones might affect sequence)
SELECT
    'Blaser Samples' as check_type,
    tracking_number,
    sample_type,
    CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER) as extracted_sequence,
    laboratory_id,
    status,
    created_at
FROM samples
WHERE client_id IN (SELECT id FROM clients WHERE name ILIKE '%blaser%')
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check type samples at your lab
SELECT
    'Type Samples (NULL client)' as check_type,
    tracking_number,
    CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER) as extracted_sequence,
    laboratory_id,
    status,
    created_at
FROM samples
WHERE client_id IS NULL
  AND sample_type = 'type'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check your lab's type sample configuration
SELECT
    'Lab Type Sample Config' as check_type,
    id,
    name,
    type_sample_prefix,
    type_sample_sequence_start
FROM laboratories
WHERE name ILIKE '%santos%' OR name ILIKE '%brazil%';

-- 6. Find the MAX sequence currently in database for Blaser at your lab
SELECT
    'Current MAX Sequence for Blaser' as check_type,
    MAX(CAST(SUBSTRING(tracking_number FROM '\d+') AS INTEGER)) as max_sequence,
    COUNT(*) as total_samples
FROM samples
WHERE client_id IN (SELECT id FROM clients WHERE name ILIKE '%blaser%')
  AND laboratory_id IN (SELECT id FROM laboratories WHERE name ILIKE '%santos%' OR name ILIKE '%brazil%');

-- 7. Test what the next tracking number would be
SELECT
    'Test Next Tracking Number' as check_type,
    generate_tracking_number(
        (SELECT id FROM clients WHERE name ILIKE '%blaser%' LIMIT 1),
        (SELECT id FROM laboratories WHERE name ILIKE '%santos%' OR name ILIKE '%brazil%' LIMIT 1),
        'Brazil',
        (SELECT id FROM client_qualities WHERE client_id IN (SELECT id FROM clients WHERE name ILIKE '%blaser%') AND quality_code = 'BD' LIMIT 1),
        false,
        'pss'
    ) as next_tracking_number;
