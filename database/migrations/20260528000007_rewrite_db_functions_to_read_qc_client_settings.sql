-- Migration: Rewrite generate_certificate_number + generate_tracking_number
-- Date: 2026-05-28
-- Part of Phase 7 (code migration) — the SQL function half.
--
-- Both functions currently do:
--     SELECT certificate_pattern INTO v_pattern FROM clients WHERE id = p_client_id;
-- and:
--     SELECT tracking_number_format INTO v_format FROM clients WHERE id = p_client_id;
--
-- After this migration both read from qc_client_settings instead, treating
-- p_client_id as a companies(id) (which is what callers will pass after the
-- app-code migration finishes).
--
-- Approach: pull the existing function definition via pg_get_functiondef,
-- regex-swap the FROM/WHERE clause, EXECUTE the rewritten DDL. This avoids
-- copying ~200 lines of function body and risking typos.
--
-- Safe to re-run: each block uses CREATE OR REPLACE semantics via the
-- regenerated DDL string.
--
-- NOT touched in this migration (deferred — these are either disabled or
-- only fire when conditions we don't have apply):
--   - convert_legacy_tracking_format  (one-time util)
--   - calculate_client_fee + recalculate_*  (fee triggers disabled per #122)

BEGIN;

-- ========================================
-- 1. generate_certificate_number
-- ========================================

DO $$
DECLARE
  v_def TEXT;
  v_new_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'generate_certificate_number'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Function generate_certificate_number not found in public schema';
  END IF;

  -- Swap the clients lookup → qc_client_settings.
  -- Matches either "FROM clients\nWHERE id = p_client_id" or single-line variants.
  v_new_def := regexp_replace(
    v_def,
    'FROM\s+clients\s+WHERE\s+id\s*=\s*p_client_id',
    'FROM qc_client_settings WHERE company_id = p_client_id',
    'gi'
  );

  IF v_new_def = v_def THEN
    RAISE EXCEPTION 'Regex did not match — generate_certificate_number body may have changed shape. Inspect manually.';
  END IF;

  EXECUTE v_new_def;
  RAISE NOTICE 'generate_certificate_number rewritten — now reads certificate_pattern from qc_client_settings.';
END $$;

-- ========================================
-- 2. generate_tracking_number
-- ========================================

DO $$
DECLARE
  v_def TEXT;
  v_new_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'generate_tracking_number'
   LIMIT 1;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Function generate_tracking_number not found in public schema';
  END IF;

  v_new_def := regexp_replace(
    v_def,
    'FROM\s+clients\s+WHERE\s+id\s*=\s*p_client_id',
    'FROM qc_client_settings WHERE company_id = p_client_id',
    'gi'
  );

  IF v_new_def = v_def THEN
    RAISE EXCEPTION 'Regex did not match — generate_tracking_number body may have changed shape. Inspect manually.';
  END IF;

  EXECUTE v_new_def;
  RAISE NOTICE 'generate_tracking_number rewritten — now reads tracking_number_format from qc_client_settings.';
END $$;

-- ========================================
-- 3. Sanity check — neither function still references "FROM clients"
-- ========================================

DO $$
DECLARE
  v_rec RECORD;
  v_found BOOLEAN := false;
BEGIN
  FOR v_rec IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('generate_certificate_number', 'generate_tracking_number')
  LOOP
    IF v_rec.def ~* 'FROM\s+clients\b' THEN
      RAISE WARNING 'Function % still references FROM clients — inspect manually.', v_rec.proname;
      v_found := true;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'Verified: neither function references "FROM clients" anymore.';
  END IF;
END $$;

COMMIT;
