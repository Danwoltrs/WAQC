-- Migration 118: Find ALL triggers on clients table (not just sync trigger)
-- There must be another trigger causing the error
-- Date: 2025-11-26

-- Find ALL triggers on the clients table
SELECT
    t.tgname as trigger_name,
    CASE t.tgenabled
        WHEN 'O' THEN 'Enabled'
        WHEN 'D' THEN 'Disabled'
        WHEN 'R' THEN 'Enabled (Replica)'
        WHEN 'A' THEN 'Enabled (Always)'
        ELSE 'Unknown: ' || t.tgenabled
    END as status,
    p.proname as function_name,
    pg_get_triggerdef(t.oid) as full_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'clients'
AND t.tgname NOT LIKE 'RI_ConstraintTrigger%'  -- Exclude internal FK triggers
ORDER BY t.tgname;

-- Also check for triggers on related tables that might be involved
SELECT
    c.relname as table_name,
    t.tgname as trigger_name,
    CASE t.tgenabled
        WHEN 'O' THEN 'Enabled'
        WHEN 'D' THEN 'Disabled'
        ELSE 'Other'
    END as status,
    p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname IN ('exporters', 'importers', 'roasters')
AND t.tgname NOT LIKE 'RI_ConstraintTrigger%'
ORDER BY c.relname, t.tgname;

SELECT 'Found all triggers' as status;
