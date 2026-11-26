import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/roasters
 * List companies that can act as coffee roasters.
 * Post-consolidation: reads from companies filtered by company_types ⊇ {roaster}.
 *
 * Response shape preserved: { roasters: [{ id, name, country, contact_email, contact_phone, notes }] }
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
      .contains('company_types', ['roaster'])
      .eq('is_active', true)
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: roasters, error } = await query

    if (error) {
      console.error('Error fetching roasters:', error)
      return NextResponse.json({ error: 'Failed to fetch roasters' }, { status: 500 })
    }

    return NextResponse.json({ roasters: roasters || [] })
  } catch (error) {
    console.error('Error in GET /api/roasters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// No POST: companies are added through POST /api/clients, which links an
// existing company instead of duplicating it (spec 2026-11-24 Piece 2).
