-- Migration 114: Diagnostic check for trigger state
-- Run this in Supabase SQL Editor to verify trigger/function status
-- Date: 2025-11-26

-- Check if trigger exists
SELECT
    tgname as trigger_name,
    tgenabled as enabled,
    pg_get_triggerdef(oid) as trigger_definition
FROM pg_trigger
WHERE tgname = 'trigger_sync_client_to_supply_chain';

-- Check if function exists and get its definition
SELECT
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'sync_client_to_supply_chain_entities'
AND n.nspname = 'public';

-- Check for any functions with similar names that might be causing issues
SELECT
    p.proname as function_name,
    n.nspname as schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname LIKE '%sync_client%';

SELECT 'Diagnostic check complete - review output to verify trigger/function state' as status;
