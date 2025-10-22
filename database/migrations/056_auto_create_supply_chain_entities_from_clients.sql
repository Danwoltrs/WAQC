-- Migration 056: Auto-create supply chain entities when clients are created
-- When a client is created with specific client_types, automatically create corresponding entity records

-- ========================================
-- STEP 1: Create function to sync client to supply chain entities
-- ========================================

CREATE OR REPLACE FUNCTION sync_client_to_supply_chain_entities()
RETURNS TRIGGER AS $$
DECLARE
    v_entity_id UUID;
BEGIN
    -- Check if client has 'exporter' or 'producer_exporter' type
    IF 'exporter'::client_type = ANY(NEW.client_types)
       OR 'producer_exporter'::client_type = ANY(NEW.client_types) THEN

        -- Insert or update exporter
        INSERT INTO exporters (name, country, contact_email, contact_phone, client_id)
        VALUES (
            COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
            NEW.country,
            NEW.email,
            NEW.phone,
            NEW.id
        )
        ON CONFLICT (id) DO UPDATE
        SET
            name = COALESCE(NEW.fantasy_name, NEW.company, NEW.name),
            country = NEW.country,
            contact_email = NEW.email,
            contact_phone = NEW.phone,
            client_id = NEW.id,
            updated_at = NOW()
        WHERE exporters.client_id = NEW.id;

        -- If no existing exporter for this client, create one
        IF NOT FOUND THEN
            -- Check if there's an exporter with matching name
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

        -- Check if there's an importer with matching name
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

    -- Check if client has 'roaster', 'roaster_final_buyer', or 'final_buyer' type
    IF 'roaster'::client_type = ANY(NEW.client_types)
       OR 'roaster_final_buyer'::client_type = ANY(NEW.client_types)
       OR 'final_buyer'::client_type = ANY(NEW.client_types) THEN

        -- Check if there's a roaster with matching name
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_client_to_supply_chain_entities() IS
'Automatically creates or links supply chain entity records (exporters, importers, roasters) when a client is created or updated based on their client_types';

-- ========================================
-- STEP 2: Create trigger on clients table
-- ========================================

DROP TRIGGER IF EXISTS trigger_sync_client_to_supply_chain ON clients;

CREATE TRIGGER trigger_sync_client_to_supply_chain
    AFTER INSERT OR UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION sync_client_to_supply_chain_entities();

COMMENT ON TRIGGER trigger_sync_client_to_supply_chain ON clients IS
'Syncs client records to supply chain entity tables based on client_types';

-- ========================================
-- STEP 3: Backfill existing clients
-- ========================================

-- Trigger the sync for all existing clients
UPDATE clients SET updated_at = updated_at WHERE client_types IS NOT NULL AND array_length(client_types, 1) > 0;

-- ========================================
-- VERIFICATION
-- ========================================

DO $$
DECLARE
    v_exporters_linked INTEGER;
    v_importers_linked INTEGER;
    v_roasters_linked INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_exporters_linked FROM exporters WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO v_importers_linked FROM importers WHERE client_id IS NOT NULL;
    SELECT COUNT(*) INTO v_roasters_linked FROM roasters WHERE client_id IS NOT NULL;

    RAISE NOTICE 'Migration 056 completed successfully';
    RAISE NOTICE 'Auto-sync trigger created for clients → supply chain entities';
    RAISE NOTICE 'Exporters linked to clients: %', v_exporters_linked;
    RAISE NOTICE 'Importers linked to clients: %', v_importers_linked;
    RAISE NOTICE 'Roasters linked to clients: %', v_roasters_linked;
END;
$$;

SELECT 'Migration 056: Auto-create supply chain entities from clients' as status;
