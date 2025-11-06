-- Check what defects exist in the database
SELECT origin, name_en, client_id, is_active, COUNT(*) as count
FROM defect_definitions
WHERE origin ILIKE '%brazil%' OR origin ILIKE '%braz%'
GROUP BY origin, name_en, client_id, is_active
LIMIT 20;
