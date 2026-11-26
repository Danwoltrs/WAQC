import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/importers
 * List companies that can act as buyers/importers of coffee.
 * Post-consolidation: reads from companies filtered by trading_roles ⊇ ["buyer"].
 *
 * Response shape preserved: { importers: [{ id, name, country, contact_email, contact_phone, notes }] }
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const country = searchParams.get('country')

    let query = (supabase as any)
      .from('companies')
      .select('id, name, fantasy_name, country, contact_email:email, contact_phone:phone, notes')
      .filter('trading_roles', 'cs', '["buyer"]')
      .eq('is_active', true)
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: importers, error } = await query

    if (error) {
      console.error('Error fetching importers:', error)
      return NextResponse.json({ error: 'Failed to fetch importers' }, { status: 500 })
    }

    return NextResponse.json({ importers: importers || [] })
  } catch (error) {
    console.error('Error in GET /api/importers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// No POST: companies are added through POST /api/clients, which links an
// existing company instead of duplicating it (spec 2026-11-24 Piece 2).
