-- Migration: Fix supply chain entity sync + migrate combo client types to individual roles
-- Date: 2026-03-11
--
-- Changes:
-- 1. Add 'end_client' to client_type enum (was in UI but missing from DB)
-- 2. Migrate combo types (producer_exporter, roaster_final_buyer) to individual types
-- 3. Add partial unique indexes on client_id for exporters/importers/roasters
-- 4. Deduplicate supply chain entity records
-- 5. Backfill to re-trigger entity creation for all typed clients

-- ========================================
-- STEP 1: Add missing 'end_client' enum value
-- ========================================
DO $$ BEGIN
    ALTER TYPE client_type ADD VALUE IF NOT EXISTS 'end_client';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================================
-- STEP 2: Migrate combo types to individual types
-- ========================================

-- Split producer_exporter → producer + exporter
UPDATE clients
SET client_types = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_remove(client_types, 'producer_exporter'::client_type)
            || ARRAY['producer','exporter']::client_type[]
        )
    )
)
WHERE 'producer_exporter'::client_type = ANY(client_types);

-- Split roaster_final_buyer → roaster + final_buyer
UPDATE clients
SET client_types = (
    SELECT ARRAY(
        SELECT DISTINCT unnest(
            array_remove(client_types, 'roaster_final_buyer'::client_type)
            || ARRAY['roaster','final_buyer']::client_type[]
        )
    )
)
WHERE 'roaster_final_buyer'::client_type = ANY(client_types);

-- ========================================
-- STEP 3: Deduplicate supply chain entity records per client_id
-- Keep the oldest record (smallest created_at), delete duplicates
-- ========================================

-- Deduplicate exporters
DELETE FROM exporters
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at ASC) AS rn
        FROM exporters
        WHERE client_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- Deduplicate importers
DELETE FROM importers
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at ASC) AS rn
        FROM importers
        WHERE client_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- Deduplicate roasters
DELETE FROM roasters
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at ASC) AS rn
        FROM roasters
        WHERE client_id IS NOT NULL
    ) ranked
    WHERE rn > 1
);

-- ========================================
-- STEP 4: Add partial unique indexes to prevent future duplicates
-- ========================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_exporters_unique_client
ON exporters(client_id) WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_importers_unique_client
ON importers(client_id) WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_roasters_unique_client
ON roasters(client_id) WHERE client_id IS NOT NULL;

-- ========================================
-- STEP 5: Backfill - re-trigger entity creation for all typed clients
-- This fires the existing trigger from migration 115 which has correct logic
-- ========================================

UPDATE clients SET updated_at = NOW()
WHERE client_types IS NOT NULL AND array_length(client_types, 1) > 0;

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_combo_count INTEGER;
    v_exporters_linked INTEGER;
    v_importers_linked INTEGER;
    v_roasters_linked INTEGER;
BEGIN
    -- Verify no combo types remain
    SELECT COUNT(*) INTO v_combo_count
    FROM clients
    WHERE 'producer_exporter'::client_type = ANY(client_types)
       OR 'roaster_final_buyer'::client_type = ANY(client_types);

    IF v_combo_count > 0 THEN
        RAISE WARNING 'Still % clients with combo types', v_combo_count;
    END IF;

    SELECT COUNT(*) INTO v_exporters_linked FROM exporters WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO v_importers_linked FROM importers WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO v_roasters_linked FROM roasters WHERE client_id IS NOT NULL;

    RAISE NOTICE 'Migration completed:';
    RAISE NOTICE '  Combo types remaining: %', v_combo_count;
    RAISE NOTICE '  Exporters linked to clients: %', v_exporters_linked;
    RAISE NOTICE '  Importers linked to clients: %', v_importers_linked;
    RAISE NOTICE '  Roasters linked to clients: %', v_roasters_linked;
END;
$$;

SELECT 'Migration: Fix supply chain sync + migrate combo client types' as status;
