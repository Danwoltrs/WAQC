import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

/**
 * GET /api/clients/search
 * Search for clients across all sources (companies, legacy_clients, QC clients)
 * Uses the database search_clients function with fuzzy matching and relevance scoring
 *
 * Query params:
 * - q: search term (required)
 * - limit: max results (default: 50)
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

    // Validate search term
    if (!searchTerm || searchTerm.trim().length < 2) {
      return NextResponse.json({
        error: 'Search term must be at least 2 characters'
      }, { status: 400 })
    }

    // Call the database search function
    type SearchResults = Database['public']['Functions']['search_clients']['Returns']
    const response = await supabase.rpc('search_clients', {
      search_term: searchTerm.trim(),
      limit_count: limit
    }) as { data: SearchResults | null; error: any }

    const { data: results, error } = response

    if (error) {
      console.error('Error searching clients:', error)
      return NextResponse.json({
        error: 'Failed to search clients',
        details: error.message
      }, { status: 500 })
    }

    // Transform results to more user-friendly format
    const transformedResults = results?.map((result: any) => ({
      id: result.qc_client_id || result.company_id,
      company_id: result.company_id,
      qc_client_id: result.qc_client_id,
      name: result.name,
      fantasy_name: result.fantasy_name,
      email: result.email,
      phone: result.phone,
      address: result.address,
      city: result.city,
      state: result.state,
      country: result.country,
      primary_category: result.primary_category,
      subcategories: result.subcategories,
      source: result.source_table,
      relevance: result.relevance_score,
      // Indicate if this is already a QC client or needs to be imported
      is_qc_client: result.source_table === 'clients',
      can_import: result.source_table !== 'clients'
    })) || []

    return NextResponse.json({
      results: transformedResults,
      count: transformedResults.length,
      search_term: searchTerm,
      limit
    })
  } catch (error) {
    console.error('Error in GET /api/clients/search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
