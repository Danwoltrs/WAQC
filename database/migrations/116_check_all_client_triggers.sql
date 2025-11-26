-- Migration 116: Check all triggers and functions on clients table
-- This will help diagnose why updates are still failing
-- Date: 2025-11-26

-- List ALL triggers on clients table
SELECT
    t.tgname as trigger_name,
    t.tgenabled as enabled,
    p.proname as function_name,
    pg_get_triggerdef(t.oid) as full_trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'clients'
AND t.tgname NOT LIKE 'RI_ConstraintTrigger%'  -- Exclude foreign key triggers
ORDER BY t.tgname;

-- Get the FULL source code of the sync function
SELECT
    p.proname as function_name,
    pg_get_functiondef(p.oid) as complete_function_source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'sync_client_to_supply_chain_entities'
AND n.nspname = 'public';

-- Check if there are multiple versions of this function
SELECT
    n.nspname as schema_name,
    p.proname as function_name,
    p.oid,
    pg_get_functiondef(p.oid) as function_def
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname LIKE '%sync%client%'
OR p.proname LIKE '%supply%chain%';

SELECT 'Check complete - review output above' as status;
