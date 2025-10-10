-- Migration 014: Fix client_search_view to return TEXT types
-- Date: 2025-10-10
-- Purpose: Cast all VARCHAR columns to TEXT in client_search_view

DROP VIEW IF EXISTS client_search_view CASCADE;

CREATE OR REPLACE VIEW client_search_view AS
SELECT
    c.id as company_id,
    NULL::UUID as qc_client_id,
    c.name::TEXT,
    c.fantasy_name::TEXT,
    c.email::TEXT,
    c.phone::TEXT,
    c.address::TEXT,
    c.city::TEXT,
    c.state::TEXT,
    c.country::TEXT,
    c.category::TEXT as primary_category,
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
    lc.descricao::TEXT as name,
    lc.descricao_fantasia::TEXT as fantasy_name,
    lc.email::TEXT,
    lc.telefone1::TEXT as phone,
    CONCAT_WS(', ', lc.endereco, lc.numero, lc.complemento, lc.bairro)::TEXT as address,
    lc.cidade::TEXT as city,
    lc.uf::TEXT as state,
    lc.pais::TEXT as country,
    lc.grupo1::TEXT as primary_category,
    ARRAY[lc.grupo2]::TEXT[] as subcategories,
    lc.legacy_client_id,
    'legacy_clients' as source_table,
    lc.created_at,
    lc.updated_at
FROM legacy_clients lc
WHERE lc.ativo = true
  AND lc.company_id IS NULL

UNION ALL

SELECT
    qc.company_id,
    qc.id as qc_client_id,
    qc.name::TEXT,
    qc.fantasy_name::TEXT,
    qc.email::TEXT,
    qc.phone::TEXT,
    qc.address::TEXT,
    qc.city::TEXT,
    qc.state::TEXT,
    qc.country::TEXT,
    CASE
        WHEN array_length(qc.client_types, 1) > 0
        THEN qc.client_types[1]::TEXT
        ELSE NULL
    END as primary_category,
    ARRAY(SELECT unnest(qc.client_types)::TEXT)::TEXT[] as subcategories,
    qc.legacy_client_id,
    'clients' as source_table,
    qc.created_at,
    qc.updated_at
FROM clients qc
WHERE qc.qc_enabled = true;

-- Recreate the search function (it was dropped by CASCADE)
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
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
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
        )::FLOAT as relevance_score
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

-- Grant permissions
GRANT SELECT ON client_search_view TO authenticated;
GRANT EXECUTE ON FUNCTION search_clients(TEXT, INTEGER) TO authenticated;

-- Add comments
COMMENT ON VIEW client_search_view IS 'Unified view combining companies, legacy_clients, and QC clients with TEXT types for searching';
COMMENT ON FUNCTION search_clients(TEXT, INTEGER) IS 'Fuzzy search function across all client sources with relevance scoring';
