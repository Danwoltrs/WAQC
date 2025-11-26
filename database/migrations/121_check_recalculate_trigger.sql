-- Migration 121: Check the recalculate trigger function
-- This might be the real culprit!
-- Date: 2025-11-26

-- Get the function definition for the recalculate trigger
SELECT pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname LIKE '%recalculate%'
AND n.nspname = 'public';

SELECT 'Found recalculate function' as status;
