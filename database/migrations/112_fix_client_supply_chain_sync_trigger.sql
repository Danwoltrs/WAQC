-- Migration 112: Fix client-to-supply-chain sync trigger
-- Description: Fix "record 'new' has no field 'client_id'" error in sync trigger
-- Date: 2025-11-26

-- Drop and recreate the trigger to ensure clean state
DROP TRIGGER IF EXISTS trigger_sync_client_to_supply_chain ON clients;

-- Drop and recreate the function with fixed ON CONFLICT logic
DROP FUNCTION IF EXISTS sync_client_to_supply_chain_entities();

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
'Automatically creates or links supply chain entity records (exporters, importers, roasters) when a client is created or updated based on their client_types. Fixed to avoid ON CONFLICT errors.';

-- Recreate the trigger
CREATE TRIGGER trigger_sync_client_to_supply_chain
    AFTER INSERT OR UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION sync_client_to_supply_chain_entities();

COMMENT ON TRIGGER trigger_sync_client_to_supply_chain ON clients IS
'Syncs client records to supply chain entity tables based on client_types';

SELECT 'Migration 112: Fixed client-to-supply-chain sync trigger' as status;
