-- Migration: Backfill clients → companies
-- Date: 2026-05-28
-- Part 2 of 7 in counterparty consolidation.
--
-- Goal: Every row in WAQC.clients gets a corresponding row in companies.
--   1. Match existing companies by legacy_client_id (cleanest match).
--   2. Match remaining clients by case-insensitive name.
--   3. For still-unmatched clients, INSERT a new companies row.
--   4. Populate clients.company_id for every row.
--   5. Set companies.is_qc_client = true where qc_enabled = true.
--   6. Insert qc_client_settings rows for QC-enabled clients.
--
-- After this migration: clients.company_id is NOT NULL for every row,
-- qc_client_settings has a row per QC-enabled client, companies.is_qc_client
-- is the authoritative QC flag.
--
-- Column storage on sys.companies:
--   trading_roles JSONB array (sys migration 20260506120000 confirms)
--   company_types TEXT[] (confirmed at migration runtime — initial attempt failed
--                         with 42804: "column company_types is of type text[] but
--                         expression is of type jsonb")

BEGIN;

-- ========================================
-- 0. Pre-flight audit
-- ========================================

DO $$
DECLARE
  v_client_count INT;
  v_already_linked INT;
BEGIN
  SELECT COUNT(*) INTO v_client_count FROM clients;
  SELECT COUNT(*) INTO v_already_linked FROM clients WHERE company_id IS NOT NULL;

  RAISE NOTICE 'Starting backfill: % total clients, % already have company_id.',
    v_client_count, v_already_linked;
END $$;

-- ========================================
-- 1. Match by legacy_client_id
-- ========================================

UPDATE clients c
SET company_id = co.id
FROM companies co
WHERE c.company_id IS NULL
  AND c.legacy_client_id IS NOT NULL
  AND co.legacy_client_id = c.legacy_client_id;

DO $$
DECLARE v_matched INT;
BEGIN
  SELECT COUNT(*) INTO v_matched FROM clients WHERE company_id IS NOT NULL;
  RAISE NOTICE 'After legacy_client_id match: % clients linked.', v_matched;
END $$;

-- ========================================
-- 2. Match by case-insensitive name
-- ========================================

UPDATE clients c
SET company_id = co.id
FROM companies co
WHERE c.company_id IS NULL
  AND c.name IS NOT NULL
  AND LENGTH(TRIM(c.name)) > 0
  AND LOWER(TRIM(c.name)) = LOWER(TRIM(co.name));

DO $$
DECLARE v_matched INT;
BEGIN
  SELECT COUNT(*) INTO v_matched FROM clients WHERE company_id IS NOT NULL;
  RAISE NOTICE 'After name match: % clients linked.', v_matched;
END $$;

-- ========================================
-- 3. Create companies for unmatched clients
-- ========================================
-- Mapping table is inlined as a CTE (temp tables don't survive across statements
-- in Supabase's SQL editor session). One client_type can map to multiple
-- company_types or trading_roles via multiple rows in the VALUES list.

WITH _client_type_map (client_type, company_type, trading_role) AS (
  VALUES
    ('producer',             'farm',         'seller'),
    ('producer_exporter',    'farm',         'seller'),
    ('producer_exporter',    'exporter',     NULL),
    ('cooperative',          'coop',         'seller'),
    ('exporter',             'exporter',     'seller'),
    ('importer_buyer',       'trader',       'buyer'),
    ('roaster',              'roaster',      NULL),
    ('final_buyer',          'final_buyer',  NULL),
    ('roaster_final_buyer',  'roaster',      NULL),
    ('roaster_final_buyer',  'final_buyer',  NULL),
    ('service_provider',     NULL,           NULL)
),
unmatched_clients AS (
  SELECT
    c.id AS client_id,
    c.name,
    c.fantasy_name,
    c.email,
    c.phone,
    c.address,
    c.city,
    c.state,
    c.country,
    c.logo_url,
    c.legacy_client_id,
    c.qc_enabled,
    -- aggregate company_types from client_types[] via mapping (text[])
    COALESCE(
      (SELECT array_agg(DISTINCT m.company_type)
         FROM unnest(c.client_types::text[]) AS ct(val)
         JOIN _client_type_map m ON m.client_type = ct.val
        WHERE m.company_type IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS company_types,
    -- aggregate trading_roles from client_types[]; add 'qc_client' if qc_enabled
    (
      SELECT to_jsonb(
        array_remove(
          array_agg(DISTINCT role) || CASE WHEN c.qc_enabled THEN ARRAY['qc_client'] ELSE ARRAY[]::TEXT[] END,
          NULL
        )
      )
      FROM (
        SELECT m.trading_role AS role
          FROM unnest(c.client_types::text[]) AS ct(val)
          JOIN _client_type_map m ON m.client_type = ct.val
         WHERE m.trading_role IS NOT NULL
      ) roles
    ) AS trading_roles
  FROM clients c
  WHERE c.company_id IS NULL
    AND c.name IS NOT NULL
    AND LENGTH(TRIM(c.name)) > 0
),
inserted AS (
  INSERT INTO companies (
    name, fantasy_name, email, phone, address, city, state, country,
    logo_url, legacy_client_id, is_qc_client,
    company_types, trading_roles, is_active
  )
  SELECT
    name, fantasy_name, email, phone, address, city, state, country,
    logo_url, legacy_client_id,
    COALESCE(qc_enabled, false) AS is_qc_client,
    COALESCE(company_types, ARRAY[]::TEXT[]),
    COALESCE(trading_roles, '[]'::jsonb),
    true
  FROM unmatched_clients
  RETURNING id, legacy_client_id, name
)
-- Link the newly created companies back to the clients rows.
UPDATE clients c
SET company_id = i.id
FROM inserted i
WHERE c.company_id IS NULL
  AND (
    (c.legacy_client_id IS NOT NULL AND c.legacy_client_id = i.legacy_client_id)
    OR (c.legacy_client_id IS NULL AND LOWER(TRIM(c.name)) = LOWER(TRIM(i.name)))
  );

DO $$
DECLARE
  v_linked INT;
  v_unlinked INT;
BEGIN
  SELECT COUNT(*) INTO v_linked FROM clients WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_unlinked FROM clients WHERE company_id IS NULL;
  RAISE NOTICE 'After create-missing pass: % linked, % still unlinked.', v_linked, v_unlinked;

  IF v_unlinked > 0 THEN
    RAISE NOTICE 'Unlinked clients (likely empty/whitespace names):';
    PERFORM 1 FROM (
      SELECT id, name FROM clients WHERE company_id IS NULL
    ) sub;
  END IF;
END $$;

-- ========================================
-- 4. Sync is_qc_client flag on companies
-- ========================================
-- For matched (pre-existing) companies, ensure is_qc_client reflects qc_enabled.

UPDATE companies co
SET is_qc_client = true
FROM clients c
WHERE c.company_id = co.id
  AND c.qc_enabled = true
  AND co.is_qc_client = false;

-- Also union 'qc_client' into trading_roles JSONB for matched companies.
UPDATE companies co
SET trading_roles = COALESCE(co.trading_roles, '[]'::jsonb) || '["qc_client"]'::jsonb
FROM clients c
WHERE c.company_id = co.id
  AND c.qc_enabled = true
  AND NOT (co.trading_roles @> '"qc_client"'::jsonb);

-- ========================================
-- 5. Populate qc_client_settings
-- ========================================

INSERT INTO qc_client_settings (
  company_id,
  certificate_pattern,
  certificate_config,
  default_quality_specs,
  pricing_model,
  billing_basis,
  notification_emails
)
SELECT
  c.company_id,
  COALESCE(c.certificate_pattern, jsonb_build_object(
    'has_quality_code', false,
    'quality_position', 'prefix',
    'has_origin_code', false,
    'origin_position', 'prefix',
    'sequence_padding', 6,
    'starting_sequence', 1,
    'year_format', 'YY',
    'separator', '-'
  )),
  COALESCE(c.certificate_config, '{}'::jsonb),
  COALESCE(c.default_quality_specs, '{}'),
  COALESCE(c.pricing_model, 'per_sample'),
  COALESCE(c.billing_basis, 'approved_only'),
  COALESCE(c.notification_emails, '{}')
FROM clients c
WHERE c.company_id IS NOT NULL
  AND c.qc_enabled = true
ON CONFLICT (company_id) DO UPDATE SET
  certificate_pattern = EXCLUDED.certificate_pattern,
  certificate_config = EXCLUDED.certificate_config,
  default_quality_specs = EXCLUDED.default_quality_specs,
  pricing_model = EXCLUDED.pricing_model,
  billing_basis = EXCLUDED.billing_basis,
  notification_emails = EXCLUDED.notification_emails;

-- ========================================
-- 6. Summary
-- ========================================

DO $$
DECLARE
  v_total_clients INT;
  v_linked INT;
  v_qc_enabled INT;
  v_settings_rows INT;
  v_qc_companies INT;
BEGIN
  SELECT COUNT(*) INTO v_total_clients FROM clients;
  SELECT COUNT(*) INTO v_linked FROM clients WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO v_qc_enabled FROM clients WHERE qc_enabled = true;
  SELECT COUNT(*) INTO v_settings_rows FROM qc_client_settings;
  SELECT COUNT(*) INTO v_qc_companies FROM companies WHERE is_qc_client = true;

  RAISE NOTICE '=== Backfill summary ===';
  RAISE NOTICE '  Clients total: %', v_total_clients;
  RAISE NOTICE '  Clients linked to companies: %', v_linked;
  RAISE NOTICE '  Clients with qc_enabled=true: %', v_qc_enabled;
  RAISE NOTICE '  qc_client_settings rows: %', v_settings_rows;
  RAISE NOTICE '  companies with is_qc_client=true: %', v_qc_companies;

  IF v_linked < v_total_clients THEN
    RAISE WARNING 'Some clients still unlinked. Inspect: SELECT id, name FROM clients WHERE company_id IS NULL;';
  END IF;
END $$;

COMMIT;
