-- Migration 011: Extend Clients Table for Full Client Management
-- Date: 2025-10-10
-- Purpose: Add address fields, client types, and legacy integration fields to clients table

-- Ensure pg_trgm extension is enabled for fuzzy search (MUST BE FIRST)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create client_type enum for multi-select support
DO $$ BEGIN
    CREATE TYPE client_type AS ENUM (
        'producer',
        'producer_exporter',
        'cooperative',
        'exporter',
        'importer_buyer',
        'roaster',
        'final_buyer',
        'roaster_final_buyer',
        'service_provider'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to clients table
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS city VARCHAR(255),
    ADD COLUMN IF NOT EXISTS state VARCHAR(255),
    ADD COLUMN IF NOT EXISTS country VARCHAR(255),
    ADD COLUMN IF NOT EXISTS client_types client_type[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS fantasy_name TEXT,
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS legacy_client_id INTEGER,
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- Add indexes for search performance
CREATE INDEX IF NOT EXISTS idx_clients_city ON clients(city);
CREATE INDEX IF NOT EXISTS idx_clients_state ON clients(state);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country);
CREATE INDEX IF NOT EXISTS idx_clients_client_types ON clients USING GIN(client_types);
CREATE INDEX IF NOT EXISTS idx_clients_fantasy_name ON clients(fantasy_name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_legacy_client_id ON clients(legacy_client_id);
CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);

-- Add full-text search indexes for better search performance
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email_trgm ON clients USING gin(email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_fantasy_name_trgm ON clients USING gin(fantasy_name gin_trgm_ops);

-- Create a view that combines companies and legacy_clients for easy searching
CREATE OR REPLACE VIEW client_search_view AS
SELECT
    c.id as company_id,
    NULL::UUID as qc_client_id,
    c.name,
    c.fantasy_name,
    c.email,
    c.phone,
    c.address,
    c.city,
    c.state,
    c.country,
    c.category::text as primary_category,
    c.subcategories,
    c.legacy_client_id,
    'companies' as source_table,
    c.created_at,
    c.updated_at
FROM companies c
WHERE c.admin_approval_required = false

UNION ALL

SELECT
    lc.company_id,
    NULL::UUID as qc_client_id,
    lc.descricao as name,
    lc.descricao_fantasia as fantasy_name,
    lc.email,
    lc.telefone1 as phone,
    CONCAT_WS(', ', lc.endereco, lc.numero, lc.complemento, lc.bairro) as address,
    lc.cidade as city,
    lc.uf as state,
    lc.pais as country,
    lc.grupo1 as primary_category,
    ARRAY[lc.grupo2] as subcategories,
    lc.legacy_client_id,
    'legacy_clients' as source_table,
    lc.created_at,
    lc.updated_at
FROM legacy_clients lc
WHERE lc.ativo = true
  AND lc.company_id IS NULL  -- Only show if not already migrated to companies table

UNION ALL

SELECT
    qc.company_id,
    qc.id as qc_client_id,
    qc.name,
    qc.fantasy_name,
    qc.email,
    qc.phone,
    qc.address,
    qc.city,
    qc.state,
    qc.country,
    CASE
        WHEN array_length(qc.client_types, 1) > 0
        THEN qc.client_types[1]::text
        ELSE NULL
    END as primary_category,
    ARRAY(SELECT unnest(qc.client_types)::text) as subcategories,
    qc.legacy_client_id,
    'clients' as source_table,
    qc.created_at,
    qc.updated_at
FROM clients qc
WHERE qc.qc_enabled = true;

-- Create a function to search clients across all tables
CREATE OR REPLACE FUNCTION search_clients(
    search_term TEXT,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    company_id UUID,
    qc_client_id UUID,
    name TEXT,
    fantasy_name TEXT,
    email TEXT,
    phone VARCHAR,
    address TEXT,
    city VARCHAR,
    state VARCHAR,
    country VARCHAR,
    primary_category TEXT,
    subcategories TEXT[],
    source_table TEXT,
    relevance_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        csv.company_id,
        csv.qc_client_id,
        csv.name,
        csv.fantasy_name,
        csv.email,
        csv.phone,
        csv.address,
        csv.city,
        csv.state,
        csv.country,
        csv.primary_category,
        csv.subcategories,
        csv.source_table,
        (
            CASE WHEN csv.name ILIKE search_term || '%' THEN 10 ELSE 0 END +
            CASE WHEN csv.fantasy_name ILIKE search_term || '%' THEN 8 ELSE 0 END +
            CASE WHEN csv.email ILIKE search_term || '%' THEN 6 ELSE 0 END +
            similarity(csv.name, search_term) * 20 +
            similarity(COALESCE(csv.fantasy_name, ''), search_term) * 15 +
            similarity(COALESCE(csv.email, ''), search_term) * 10
        ) as relevance_score
    FROM client_search_view csv
    WHERE
        csv.name ILIKE '%' || search_term || '%'
        OR csv.fantasy_name ILIKE '%' || search_term || '%'
        OR csv.email ILIKE '%' || search_term || '%'
        OR csv.phone ILIKE '%' || search_term || '%'
    ORDER BY relevance_score DESC, csv.name ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for client search
CREATE POLICY "QC users can search all clients" ON clients
    FOR SELECT USING (
        get_user_qc_role(auth.uid()) IS NOT NULL
    );

-- Grant necessary permissions
GRANT SELECT ON client_search_view TO authenticated;
GRANT EXECUTE ON FUNCTION search_clients(TEXT, INTEGER) TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN clients.city IS 'City where the client is located';
COMMENT ON COLUMN clients.state IS 'State or province where the client is located';
COMMENT ON COLUMN clients.country IS 'Country where the client is located';
COMMENT ON COLUMN clients.client_types IS 'Array of client type categories (producer, exporter, roaster, etc.)';
COMMENT ON COLUMN clients.fantasy_name IS 'Trade name or doing-business-as name';
COMMENT ON COLUMN clients.phone IS 'Primary phone number';
COMMENT ON COLUMN clients.legacy_client_id IS 'Reference to legacy client ID from old system';
COMMENT ON COLUMN clients.company_id IS 'Reference to companies table for integration with trips.wolthers.com';

COMMENT ON VIEW client_search_view IS 'Unified view combining companies, legacy_clients, and QC clients for searching';
COMMENT ON FUNCTION search_clients(TEXT, INTEGER) IS 'Fuzzy search function across all client sources with relevance scoring';
