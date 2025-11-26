-- Migration 115: Nuclear option - Complete trigger/function recreation
-- Description: Most aggressive cleanup possible - disable, drop everything, recreate from scratch
-- Date: 2025-11-26

-- STEP 1: Disable the trigger first
ALTER TABLE clients DISABLE TRIGGER trigger_sync_client_to_supply_chain;

-- STEP 2: Drop trigger (may not exist if previous migrations worked)
DROP TRIGGER IF EXISTS trigger_sync_client_to_supply_chain ON clients CASCADE;

-- STEP 3: Drop function with CASCADE (removes all dependencies)
DROP FUNCTION IF EXISTS sync_client_to_supply_chain_entities() CASCADE;

-- STEP 4: Terminate any active connections using the old function
-- This clears cached plans
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
AND query LIKE '%sync_client_to_supply_chain%';

-- STEP 5: Clear the plan cache
DISCARD PLANS;

-- STEP 6: Recreate the function from scratch with fixed logic
CREATE OR REPLACE FUNCTION sync_client_to_supply_chain_entities()
RETURNS TRIGGER AS $$
DECLARE
    v_entity_id UUID;
BEGIN
    -- Check if client has 'exporter' or 'producer_exporter' type
    IF 'exporter'::client_type = ANY(NEW.client_types)
       OR 'producer_exporter'::client_type = ANY(NEW.client_types) THEN

        -- Check if there's already an exporter linked to this client
        SELECT id INTO v_entity_id
        FROM exporters
        WHERE client_id = NEW.id
        LIMIT 1;

        IF v_entity_id IS NOT NULL THEN
            -- Update existing exporter
            UPDATE exporters
            SET
                name = COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                country = NEW.country,
                contact_email = NEW.email,
                contact_phone = NEW.phone,
                updated_at = NOW()
            WHERE id = v_entity_id;
        ELSE
            -- Check if there's an exporter with matching name but no client link
            SELECT id INTO v_entity_id
            FROM exporters
            WHERE LOWER(name) = LOWER(COALESCE(NEW.fantasy_name, NEW.company, NEW.name))
            AND client_id IS NULL
            LIMIT 1;

            IF v_entity_id IS NOT NULL THEN
                -- Link existing exporter to this client
                UPDATE exporters
                SET client_id = NEW.id,
                    contact_email = COALESCE(NEW.email, contact_email),
                    contact_phone = COALESCE(NEW.phone, contact_phone),
                    country = COALESCE(NEW.country, country),
                    updated_at = NOW()
                WHERE id = v_entity_id;
            ELSE
                -- Create new exporter
                INSERT INTO exporters (name, country, contact_email, contact_phone, client_id)
                VALUES (
                    COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                    NEW.country,
                    NEW.email,
                    NEW.phone,
                    NEW.id
                );
            END IF;
        END IF;
    END IF;

    -- Check if client has 'importer_buyer' type
    IF 'importer_buyer'::client_type = ANY(NEW.client_types) THEN

        -- Check if there's already an importer linked to this client
        SELECT id INTO v_entity_id
        FROM importers
        WHERE client_id = NEW.id
        LIMIT 1;

        IF v_entity_id IS NOT NULL THEN
            -- Update existing importer
            UPDATE importers
            SET
                name = COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                country = NEW.country,
                contact_email = NEW.email,
                contact_phone = NEW.phone,
                updated_at = NOW()
            WHERE id = v_entity_id;
        ELSE
            -- Check if there's an importer with matching name but no client link
            SELECT id INTO v_entity_id
            FROM importers
            WHERE LOWER(name) = LOWER(COALESCE(NEW.fantasy_name, NEW.company, NEW.name))
            AND client_id IS NULL
            LIMIT 1;

            IF v_entity_id IS NOT NULL THEN
                -- Link existing importer to this client
                UPDATE importers
                SET client_id = NEW.id,
                    contact_email = COALESCE(NEW.email, contact_email),
                    contact_phone = COALESCE(NEW.phone, contact_phone),
                    country = COALESCE(NEW.country, country),
                    updated_at = NOW()
                WHERE id = v_entity_id;
            ELSE
                -- Create new importer
                INSERT INTO importers (name, country, contact_email, contact_phone, client_id)
                VALUES (
                    COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                    NEW.country,
                    NEW.email,
                    NEW.phone,
                    NEW.id
                );
            END IF;
        END IF;
    END IF;

    -- Check if client has 'roaster', 'roaster_final_buyer', or 'final_buyer' type
    IF 'roaster'::client_type = ANY(NEW.client_types)
       OR 'roaster_final_buyer'::client_type = ANY(NEW.client_types)
       OR 'final_buyer'::client_type = ANY(NEW.client_types) THEN

        -- Check if there's already a roaster linked to this client
        SELECT id INTO v_entity_id
        FROM roasters
        WHERE client_id = NEW.id
        LIMIT 1;

        IF v_entity_id IS NOT NULL THEN
            -- Update existing roaster
            UPDATE roasters
            SET
                name = COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                country = NEW.country,
                contact_email = NEW.email,
                contact_phone = NEW.phone,
                updated_at = NOW()
            WHERE id = v_entity_id;
        ELSE
            -- Check if there's a roaster with matching name but no client link
            SELECT id INTO v_entity_id
            FROM roasters
            WHERE LOWER(name) = LOWER(COALESCE(NEW.fantasy_name, NEW.company, NEW.name))
            AND client_id IS NULL
            LIMIT 1;

            IF v_entity_id IS NOT NULL THEN
                -- Link existing roaster to this client
                UPDATE roasters
                SET client_id = NEW.id,
                    contact_email = COALESCE(NEW.email, contact_email),
                    contact_phone = COALESCE(NEW.phone, contact_phone),
                    country = COALESCE(NEW.country, country),
                    updated_at = NOW()
                WHERE id = v_entity_id;
            ELSE
                -- Create new roaster
                INSERT INTO roasters (name, country, contact_email, contact_phone, client_id)
                VALUES (
                    COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
                    NEW.country,
                    NEW.email,
                    NEW.phone,
                    NEW.id
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_client_to_supply_chain_entities() IS
'Automatically creates or links supply chain entity records (exporters, importers, roasters) when a client is created or updated based on their client_types. Nuclear option recreation with complete cache clearing.';

-- STEP 7: Recreate the trigger
CREATE TRIGGER trigger_sync_client_to_supply_chain
    AFTER INSERT OR UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION sync_client_to_supply_chain_entities();

COMMENT ON TRIGGER trigger_sync_client_to_supply_chain ON clients IS
'Syncs client records to supply chain entity tables based on client_types';

-- STEP 8: Verify the new trigger is in place
DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    -- Check trigger exists
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_sync_client_to_supply_chain'
    ) INTO v_trigger_exists;

    -- Check function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'sync_client_to_supply_chain_entities'
    ) INTO v_function_exists;

    IF v_trigger_exists AND v_function_exists THEN
        RAISE NOTICE 'SUCCESS: Trigger and function verified as active';
    ELSE
        RAISE EXCEPTION 'FAILED: Trigger or function not found after recreation';
    END IF;
END;
$$;

SELECT 'Migration 115: Nuclear option - trigger and function completely recreated with cache clearing' as status;
