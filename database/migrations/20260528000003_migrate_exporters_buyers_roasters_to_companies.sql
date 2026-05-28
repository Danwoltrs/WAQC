-- Migration: Migrate exporters / importers / roasters → companies
-- Date: 2026-05-28
-- Part 3 of 7 in counterparty consolidation.
--
-- Goal: Every row in WAQC.exporters / WAQC.importers / WAQC.roasters gets a
-- corresponding row in companies. For each table:
--   1. Add company_id UUID column linking to companies(id).
--   2. Match existing companies by case-insensitive name.
--   3. For unmatched rows, INSERT a new companies row with appropriate
--      company_types (text[]) and trading_roles (jsonb array).
--   4. For matched companies, UPDATE to ADD the role/type if missing
--      (companies can play multiple roles — e.g. a trader that's both
--      buyer and seller).
--
-- Role/type mapping:
--   exporters → company_types += 'exporter',  trading_roles += 'seller'
--   importers    →                                trading_roles += 'buyer'
--   roasters  → company_types += 'roaster'
--
-- After this migration: every legacy row has a company_id link, and every
-- distinct counterparty in WAQC exists in companies with the right tags.
-- Sample FK repointing happens in migration #4 (trivial — samples is empty).

BEGIN;

-- ========================================
-- 0. Pre-flight counts
-- ========================================

DO $$
DECLARE
  v_exp INT;
  v_buy INT;
  v_roast INT;
BEGIN
  SELECT COUNT(*) INTO v_exp FROM exporters;
  SELECT COUNT(*) INTO v_buy FROM importers;
  SELECT COUNT(*) INTO v_roast FROM roasters;
  RAISE NOTICE 'Pre-flight: % exporters, % importers, % roasters to migrate.', v_exp, v_buy, v_roast;
END $$;

-- ========================================
-- 1. Add company_id columns
-- ========================================

ALTER TABLE exporters ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE importers    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE roasters  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exporters_company_id ON exporters(company_id);
CREATE INDEX IF NOT EXISTS idx_importers_company_id ON importers(company_id);
CREATE INDEX IF NOT EXISTS idx_roasters_company_id ON roasters(company_id);

-- ========================================
-- 2. EXPORTERS — match by name
-- ========================================

UPDATE exporters e
SET company_id = co.id
FROM companies co
WHERE e.company_id IS NULL
  AND e.name IS NOT NULL
  AND LENGTH(TRIM(e.name)) > 0
  AND LOWER(TRIM(e.name)) = LOWER(TRIM(co.name));

-- For matched exporters, ensure 'exporter' is in company_types and 'seller' in trading_roles.
-- company_types is text[]; trading_roles is jsonb array.
UPDATE companies co
SET company_types = ARRAY(
      SELECT DISTINCT unnest(COALESCE(co.company_types, ARRAY[]::TEXT[]) || ARRAY['exporter'])
    )
FROM exporters e
WHERE e.company_id = co.id
  AND NOT ('exporter' = ANY(COALESCE(co.company_types, ARRAY[]::TEXT[])));

UPDATE companies co
SET trading_roles = COALESCE(co.trading_roles, '[]'::jsonb) || '["seller"]'::jsonb
FROM exporters e
WHERE e.company_id = co.id
  AND NOT (COALESCE(co.trading_roles, '[]'::jsonb) @> '"seller"'::jsonb);

-- Create companies for unmatched exporters
WITH unmatched AS (
  SELECT
    e.id AS source_id,
    e.name,
    e.country,
    e.contact_email,
    e.contact_phone,
    e.notes
  FROM exporters e
  WHERE e.company_id IS NULL
    AND e.name IS NOT NULL
    AND LENGTH(TRIM(e.name)) > 0
),
inserted AS (
  INSERT INTO companies (
    name, country, email, phone, notes,
    company_types, trading_roles, is_active, is_qc_client
  )
  SELECT
    name, country, contact_email, contact_phone, notes,
    ARRAY['exporter']::TEXT[],
    '["seller"]'::jsonb,
    true,
    false
  FROM unmatched
  RETURNING id, name
)
UPDATE exporters e
SET company_id = i.id
FROM inserted i
WHERE e.company_id IS NULL
  AND LOWER(TRIM(e.name)) = LOWER(TRIM(i.name));

-- ========================================
-- 3. BUYERS — match by name
-- ========================================

UPDATE importers b
SET company_id = co.id
FROM companies co
WHERE b.company_id IS NULL
  AND b.name IS NOT NULL
  AND LENGTH(TRIM(b.name)) > 0
  AND LOWER(TRIM(b.name)) = LOWER(TRIM(co.name));

-- For matched importers, ensure 'buyer' is in trading_roles
UPDATE companies co
SET trading_roles = COALESCE(co.trading_roles, '[]'::jsonb) || '["buyer"]'::jsonb
FROM importers b
WHERE b.company_id = co.id
  AND NOT (COALESCE(co.trading_roles, '[]'::jsonb) @> '"buyer"'::jsonb);

-- Create companies for unmatched importers
WITH unmatched AS (
  SELECT
    b.id AS source_id,
    b.name,
    b.country,
    b.contact_email,
    b.contact_phone,
    b.notes
  FROM importers b
  WHERE b.company_id IS NULL
    AND b.name IS NOT NULL
    AND LENGTH(TRIM(b.name)) > 0
),
inserted AS (
  INSERT INTO companies (
    name, country, email, phone, notes,
    company_types, trading_roles, is_active, is_qc_client
  )
  SELECT
    name, country, contact_email, contact_phone, notes,
    ARRAY[]::TEXT[],
    '["buyer"]'::jsonb,
    true,
    false
  FROM unmatched
  RETURNING id, name
)
UPDATE importers b
SET company_id = i.id
FROM inserted i
WHERE b.company_id IS NULL
  AND LOWER(TRIM(b.name)) = LOWER(TRIM(i.name));

-- ========================================
-- 4. ROASTERS — match by name
-- ========================================

UPDATE roasters r
SET company_id = co.id
FROM companies co
WHERE r.company_id IS NULL
  AND r.name IS NOT NULL
  AND LENGTH(TRIM(r.name)) > 0
  AND LOWER(TRIM(r.name)) = LOWER(TRIM(co.name));

-- For matched roasters, ensure 'roaster' is in company_types
UPDATE companies co
SET company_types = ARRAY(
      SELECT DISTINCT unnest(COALESCE(co.company_types, ARRAY[]::TEXT[]) || ARRAY['roaster'])
    )
FROM roasters r
WHERE r.company_id = co.id
  AND NOT ('roaster' = ANY(COALESCE(co.company_types, ARRAY[]::TEXT[])));

-- Create companies for unmatched roasters
WITH unmatched AS (
  SELECT
    r.id AS source_id,
    r.name,
    r.country,
    r.contact_email,
    r.contact_phone,
    r.notes
  FROM roasters r
  WHERE r.company_id IS NULL
    AND r.name IS NOT NULL
    AND LENGTH(TRIM(r.name)) > 0
),
inserted AS (
  INSERT INTO companies (
    name, country, email, phone, notes,
    company_types, trading_roles, is_active, is_qc_client
  )
  SELECT
    name, country, contact_email, contact_phone, notes,
    ARRAY['roaster']::TEXT[],
    '[]'::jsonb,
    true,
    false
  FROM unmatched
  RETURNING id, name
)
UPDATE roasters r
SET company_id = i.id
FROM inserted i
WHERE r.company_id IS NULL
  AND LOWER(TRIM(r.name)) = LOWER(TRIM(i.name));

-- ========================================
-- 5. Summary
-- ========================================

DO $$
DECLARE
  v_exp_total INT;
  v_exp_linked INT;
  v_buy_total INT;
  v_buy_linked INT;
  v_roast_total INT;
  v_roast_linked INT;
BEGIN
  SELECT COUNT(*) INTO v_exp_total FROM exporters;
  SELECT COUNT(*) INTO v_exp_linked FROM exporters WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_buy_total FROM importers;
  SELECT COUNT(*) INTO v_buy_linked FROM importers WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_roast_total FROM roasters;
  SELECT COUNT(*) INTO v_roast_linked FROM roasters WHERE company_id IS NOT NULL;

  RAISE NOTICE '=== Migration #3 summary ===';
  RAISE NOTICE '  exporters: %/%/ linked', v_exp_linked, v_exp_total;
  RAISE NOTICE '  importers:    %/%/ linked', v_buy_linked, v_buy_total;
  RAISE NOTICE '  roasters:  %/%/ linked', v_roast_linked, v_roast_total;

  IF v_exp_linked < v_exp_total
     OR v_buy_linked < v_buy_total
     OR v_roast_linked < v_roast_total THEN
    RAISE WARNING 'Some rows unlinked (likely empty/whitespace names). Inspect:';
    RAISE WARNING '  SELECT id, name FROM exporters WHERE company_id IS NULL;';
    RAISE WARNING '  SELECT id, name FROM importers    WHERE company_id IS NULL;';
    RAISE WARNING '  SELECT id, name FROM roasters  WHERE company_id IS NULL;';
  END IF;
END $$;

COMMIT;
