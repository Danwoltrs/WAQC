-- Migration: Complete qc_client_settings + drop broken/obsolete DB objects
-- Date: 2026-05-28
-- Part 6 of the counterparty consolidation (originally planned as "drop legacy
-- tables"; revised to defer table drops until after app code migration).
--
-- Scope:
--   1. Add WAQC-specific columns missed in migration #1 (tracking_number_format,
--      pricing/billing fields, sample defaults, branding) so the new schema can
--      fully replace clients.* for QC purposes.
--   2. Backfill all those columns from clients into qc_client_settings.
--   3. Drop the broken client_search_view + search_clients() function (the view
--      references companies.category/subcategories/admin_approval_required which
--      no longer exist on sys's schema).
--   4. Drop the obsolete sync trigger + function (consolidation eliminates the
--      need to sync clients → exporters/roasters).
--
-- NOT in scope (deferred to Phase 7 code migration):
--   - Rewriting generate_certificate_number, generate_tracking_number,
--     calculate_client_fee, etc. These still read from clients and continue
--     to work until app code is repointed in one atomic switch.
--   - Dropping the legacy tables (exporters, importers, roasters, clients).
--   - Dropping the client_type enum.

BEGIN;

-- ========================================
-- 1. Add missing WAQC-specific columns
-- ========================================

ALTER TABLE qc_client_settings
  ADD COLUMN IF NOT EXISTS tracking_number_format       JSONB,
  ADD COLUMN IF NOT EXISTS price_per_sample             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS price_per_pound_cents        DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS currency                     VARCHAR(3) DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS fee_payer                    fee_payer DEFAULT 'client_pays',
  ADD COLUMN IF NOT EXISTS payment_terms                TEXT,
  ADD COLUMN IF NOT EXISTS billing_notes                TEXT,
  ADD COLUMN IF NOT EXISTS bag_weight_kg                DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS has_origin_pricing           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_delivery_timing  TEXT DEFAULT 'upon_approval',
  ADD COLUMN IF NOT EXISTS sample_size_grams            INTEGER DEFAULT 350,
  ADD COLUMN IF NOT EXISTS moisture_standard            moisture_standard DEFAULT 'coffee_industry',
  ADD COLUMN IF NOT EXISTS defect_photos                TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storage_layout               JSONB,
  ADD COLUMN IF NOT EXISTS tax_region                   TEXT,
  ADD COLUMN IF NOT EXISTS report_branding_preference   TEXT DEFAULT 'co_branded';

COMMENT ON COLUMN qc_client_settings.tracking_number_format IS
  'JSONB pattern config for tracking number generation. Migrated from clients.tracking_number_format.';
COMMENT ON COLUMN qc_client_settings.price_per_sample IS
  'Flat fee charged per sample (when pricing_model = per_sample).';
COMMENT ON COLUMN qc_client_settings.price_per_pound_cents IS
  'Per-pound fee in cents (when pricing_model = per_pound).';
COMMENT ON COLUMN qc_client_settings.report_branding_preference IS
  'co_branded | wolthers_only | white_label — drives report PDF header rendering.';

-- ========================================
-- 2. Backfill from clients (dynamic — only columns that exist on clients)
-- ========================================
-- Some columns may have been renamed/removed by later migrations (e.g.
-- bag_weight_kg was restructured in migration 057). This block detects
-- which source columns exist and only updates those.

DO $$
DECLARE
  v_target_cols TEXT[] := ARRAY[
    'tracking_number_format',
    'price_per_sample',
    'price_per_pound_cents',
    'currency',
    'fee_payer',
    'payment_terms',
    'billing_notes',
    'bag_weight_kg',
    'has_origin_pricing',
    'certificate_delivery_timing',
    'sample_size_grams',
    'moisture_standard',
    'defect_photos',
    'storage_layout',
    'tax_region',
    'report_branding_preference'
  ];
  v_existing TEXT[];
  v_missing TEXT[];
  v_col TEXT;
  v_set_clauses TEXT[] := ARRAY[]::TEXT[];
  v_sql TEXT;
  v_updated INT;
BEGIN
  -- Which of our target columns actually exist on clients?
  SELECT array_agg(column_name)
    INTO v_existing
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'clients'
     AND column_name = ANY(v_target_cols);

  -- And which ones DIDN'T survive on clients (so we can report)?
  SELECT array_agg(c) INTO v_missing
    FROM unnest(v_target_cols) c
   WHERE c <> ALL(COALESCE(v_existing, ARRAY[]::TEXT[]));

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE NOTICE 'Columns not present on clients (skipping in backfill): %', v_missing;
  END IF;

  IF v_existing IS NULL OR array_length(v_existing, 1) = 0 THEN
    RAISE NOTICE 'No source columns to backfill — qc_client_settings keeps defaults.';
    RETURN;
  END IF;

  -- Build SET clauses, using COALESCE so a NULL on clients keeps the qc_client_settings default
  FOREACH v_col IN ARRAY v_existing LOOP
    v_set_clauses := v_set_clauses ||
      format('%I = COALESCE(c.%I, qcs.%I)', v_col, v_col, v_col);
  END LOOP;

  v_sql := format(
    'UPDATE qc_client_settings qcs SET %s FROM clients c '
    'WHERE qcs.company_id = c.company_id AND c.qc_enabled = true',
    array_to_string(v_set_clauses, ', ')
  );

  EXECUTE v_sql;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'Backfilled % columns into % rows of qc_client_settings.',
    array_length(v_existing, 1), v_updated;
END $$;

DO $$
DECLARE
  v_settings INT;
  v_with_pattern INT;
BEGIN
  SELECT COUNT(*) INTO v_settings FROM qc_client_settings;
  SELECT COUNT(*) INTO v_with_pattern
    FROM qc_client_settings
    WHERE tracking_number_format IS NOT NULL;

  RAISE NOTICE 'qc_client_settings rows: %, with tracking_number_format: %',
    v_settings, v_with_pattern;
END $$;

-- ========================================
-- 3. Drop broken client_search_view + its dependent function
-- ========================================
-- The view references columns on companies that don't exist anymore
-- (category, subcategories, admin_approval_required). Any caller of
-- search_clients() is already getting errors.

DROP FUNCTION IF EXISTS search_clients(TEXT, INTEGER);
DROP VIEW IF EXISTS client_search_view CASCADE;

-- ========================================
-- 4. Drop obsolete supply-chain sync trigger + function
-- ========================================
-- After consolidation, exporters/roasters are not auto-created from clients
-- (everything is a company). The sync was a workaround for the dual-table
-- model that no longer applies.

DROP TRIGGER IF EXISTS trigger_sync_client_to_supply_chain ON clients;
DROP FUNCTION IF EXISTS sync_client_to_supply_chain_entities() CASCADE;

-- ========================================
-- 5. Summary
-- ========================================

DO $$
DECLARE
  v_settings INT;
  v_view_exists BOOLEAN;
  v_func_exists BOOLEAN;
  v_sync_func_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_settings FROM qc_client_settings;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'client_search_view'
  ) INTO v_view_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'search_clients'
  ) INTO v_func_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'sync_client_to_supply_chain_entities'
  ) INTO v_sync_func_exists;

  RAISE NOTICE '=== Migration #6 summary ===';
  RAISE NOTICE '  qc_client_settings rows: %', v_settings;
  RAISE NOTICE '  client_search_view exists: %', v_view_exists;
  RAISE NOTICE '  search_clients() exists: %', v_func_exists;
  RAISE NOTICE '  sync_client_to_supply_chain_entities() exists: %', v_sync_func_exists;

  IF v_view_exists OR v_func_exists OR v_sync_func_exists THEN
    RAISE WARNING 'Cleanup incomplete — investigate.';
  END IF;
END $$;

COMMIT;
