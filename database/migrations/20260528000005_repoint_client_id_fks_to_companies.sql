-- Migration: Repoint all remaining client_id FKs to companies
-- Date: 2026-05-28
-- Part 5 of 7 in counterparty consolidation.
--
-- Every public table with a client_id FK to clients(id) — except the ones
-- already handled in migration #4 (samples, certificate_sequences) and the
-- legacy tables being dropped in migration #6 (exporters, importers, roasters)
-- — gets its FK repointed to companies(id).
--
-- For tables with actual data (client_qualities, profiles, defect_definitions,
-- etc.), the client_id column values are UPDATED via clients.company_id lookup
-- so existing rows continue to reference the right entity post-migration.
--
-- Constraint names and ON DELETE rules are preserved.
--
-- This migration is fully dynamic — it queries information_schema for every
-- matching FK at runtime, so any client_id reference we forgot in the inventory
-- is still handled correctly.

BEGIN;

-- ========================================
-- 0. Pre-flight: enumerate FKs that will be repointed
-- ========================================

DO $$
DECLARE
  v_rec RECORD;
  v_count INT := 0;
BEGIN
  RAISE NOTICE '=== Pre-flight: FKs to be repointed ===';
  FOR v_rec IN
    SELECT
      tc.table_name,
      kcu.column_name,
      rc.delete_rule,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'clients'
      AND ccu.column_name = 'id'
      AND tc.table_name NOT IN (
        'exporters', 'importers', 'roasters',          -- dropped in #6
        'samples', 'certificate_sequences'             -- handled in #4
      )
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    RAISE NOTICE '  %.% (ON DELETE %, constraint %)',
      v_rec.table_name, v_rec.column_name, v_rec.delete_rule, v_rec.constraint_name;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Total FKs to repoint: %', v_count;
END $$;

-- ========================================
-- 1. Orphan check
-- ========================================
-- Any row referencing a clients.id where clients.company_id IS NULL would
-- become orphaned (the UPDATE in step 2 would set client_id to NULL).
-- This shouldn't happen since migration #2 backfilled every clients.company_id,
-- but verifying explicitly.

DO $$
DECLARE
  v_rec RECORD;
  v_orphans INT;
  v_total_orphans INT := 0;
  v_sql TEXT;
BEGIN
  FOR v_rec IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'clients'
      AND ccu.column_name = 'id'
      AND tc.table_name NOT IN ('exporters', 'importers', 'roasters', 'samples', 'certificate_sequences')
  LOOP
    v_sql := format(
      'SELECT COUNT(*) FROM %I t LEFT JOIN clients c ON c.id = t.%I '
      'WHERE t.%I IS NOT NULL AND (c.id IS NULL OR c.company_id IS NULL)',
      v_rec.table_name, v_rec.column_name, v_rec.column_name
    );
    EXECUTE v_sql INTO v_orphans;
    IF v_orphans > 0 THEN
      RAISE WARNING 'Orphans in %.%: % rows reference missing client or client.company_id IS NULL',
        v_rec.table_name, v_rec.column_name, v_orphans;
      v_total_orphans := v_total_orphans + v_orphans;
    END IF;
  END LOOP;

  IF v_total_orphans > 0 THEN
    RAISE WARNING 'Total orphan rows across all tables: % (these will have client_id set to NULL post-migration).', v_total_orphans;
  ELSE
    RAISE NOTICE 'No orphans detected — all client_id values map cleanly to companies.';
  END IF;
END $$;

-- ========================================
-- 2. Repoint loop
-- ========================================
-- For each FK: drop old constraint, UPDATE column values to companies.id,
-- add new constraint pointing to companies.

DO $$
DECLARE
  v_rec RECORD;
  v_sql TEXT;
  v_updated INT;
  v_total_fks INT := 0;
  v_total_rows INT := 0;
BEGIN
  FOR v_rec IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'clients'
      AND ccu.column_name = 'id'
      AND tc.table_name NOT IN ('exporters', 'importers', 'roasters', 'samples', 'certificate_sequences')
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    -- a. Drop the old FK constraint
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',
                   v_rec.table_name, v_rec.constraint_name);

    -- b. Update column values: clients.id → clients.company_id
    v_sql := format(
      'UPDATE %I t SET %I = c.company_id FROM clients c WHERE t.%I = c.id',
      v_rec.table_name, v_rec.column_name, v_rec.column_name
    );
    EXECUTE v_sql;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- c. Add the new FK pointing to companies, preserving ON DELETE rule
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES companies(id) ON DELETE %s',
      v_rec.table_name, v_rec.constraint_name, v_rec.column_name, v_rec.delete_rule
    );

    RAISE NOTICE '  Repointed %.% (% rows updated)',
      v_rec.table_name, v_rec.column_name, v_updated;
    v_total_fks := v_total_fks + 1;
    v_total_rows := v_total_rows + v_updated;
  END LOOP;

  RAISE NOTICE '=== Repointing complete: % FKs, % rows updated ===',
    v_total_fks, v_total_rows;
END $$;

-- ========================================
-- 3. Verification — no surviving FKs to clients (outside dropped tables)
-- ========================================

DO $$
DECLARE
  v_remaining INT;
  v_rec RECORD;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND ccu.table_name = 'clients'
    AND ccu.column_name = 'id'
    AND tc.table_name NOT IN ('exporters', 'importers', 'roasters');  -- these still legitimately reference clients (will be dropped in #6)

  IF v_remaining > 0 THEN
    RAISE WARNING 'Still have % FKs to clients that should have been repointed:', v_remaining;
    FOR v_rec IN
      SELECT tc.table_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name = 'clients'
        AND ccu.column_name = 'id'
        AND tc.table_name NOT IN ('exporters', 'importers', 'roasters')
    LOOP
      RAISE WARNING '  %.%', v_rec.table_name, v_rec.constraint_name;
    END LOOP;
  ELSE
    RAISE NOTICE 'Verification passed: all non-legacy FKs to clients have been repointed to companies.';
  END IF;
END $$;

COMMIT;
