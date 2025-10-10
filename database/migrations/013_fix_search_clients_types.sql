-- Migration 013: Fix search_clients function type mismatch
-- Date: 2025-10-10
-- Purpose: Fix type mismatch between VARCHAR and TEXT in search_clients function

-- Drop and recreate the function with consistent TEXT types
DROP FUNCTION IF EXISTS search_clients(TEXT, INTEGER);

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
        csv.phone::TEXT,
        csv.address,
        csv.city::TEXT,
        csv.state::TEXT,
        csv.country::TEXT,
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_clients(TEXT, INTEGER) TO authenticated;

-- Add comment
COMMENT ON FUNCTION search_clients(TEXT, INTEGER) IS 'Fuzzy search function across all client sources with relevance scoring (fixed types)';
