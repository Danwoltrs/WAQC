import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/clients/search
 *
 * Search companies (the canonical post-consolidation counterparty table) for
 * candidate clients. Returns both rows that are already wired up as QC clients
 * (`is_qc_client = true`) and rows that aren't yet (so the caller can import
 * them as a new QC client).
 *
 * Query params:
 *   q     — search term (min 2 chars)
 *   limit — max results (default 50)
 *
 * Pre-consolidation this route called the `search_clients()` Postgres function,
 * which did fuzzy-match + relevance scoring across companies, legacy_clients,
 * and the dropped clients table. Migration #6 dropped that function; this is
 * the plain-Supabase equivalent. Relevance is set to 1.0 on every row (the UI
 * doesn't actually consume it).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const searchTerm = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json({
        error: 'Search term must be at least 2 characters'
      }, { status: 400 })
    }

    const term = searchTerm.trim()
    // PostgREST .or() uses commas to separate filters and parens to group —
    // for ilike we need to escape commas in user input or it'll be parsed as
    // a filter separator. Same for parens. ASCII-only sanitization is enough
    // for our purposes (Brazilian + Latin-American company names).
    const safeTerm = term.replace(/[,()]/g, ' ')

    const { data, error } = await (supabase as any)
      .from('companies')
      .select(
        'id, name, fantasy_name, email, phone, address, city, state, country, ' +
        'company_types, trading_roles, is_qc_client'
      )
      .or(`name.ilike.%${safeTerm}%,fantasy_name.ilike.%${safeTerm}%`)
      .order('name', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Error searching clients:', error)
      return NextResponse.json({
        error: 'Failed to search clients',
        details: error.message
      }, { status: 500 })
    }

    const transformedResults = (data || []).map((row: any) => ({
      id: row.id,
      company_id: row.id,
      qc_client_id: row.is_qc_client ? row.id : null,
      name: row.name,
      fantasy_name: row.fantasy_name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
      primary_category: Array.isArray(row.company_types) && row.company_types.length > 0
        ? row.company_types[0]
        : null,
      subcategories: Array.isArray(row.company_types) ? row.company_types.slice(1) : null,
      source: 'companies',
      // Legacy field name preserved for the existing UI that switches on it.
      source_table: 'companies',
      relevance: 1.0,
      is_qc_client: row.is_qc_client === true,
      can_import: row.is_qc_client !== true,
    }))

    return NextResponse.json({
      results: transformedResults,
      count: transformedResults.length,
      search_term: term,
      limit
    })
  } catch (error) {
    console.error('Error in GET /api/clients/search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
