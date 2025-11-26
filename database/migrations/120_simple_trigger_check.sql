-- Migration 120: Simplest possible trigger check
-- Date: 2025-11-26

-- Just list ALL triggers on clients table, no filtering
SELECT
    tgname,
    tgenabled,
    tgisinternal
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'clients'
ORDER BY tgname;
