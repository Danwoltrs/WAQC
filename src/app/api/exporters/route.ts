import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/exporters
 * List companies that can act as sellers or shippers of coffee. The list
 * feeds both the Seller and the Shipper pickers, so it reads companies tagged
 * on sys with the seller OR shipper trading role, or the exporter company
 * type. A shipper-only tag is how sys often carries an exporter whose seller
 * role was never set (prod: the one active Ipanema row, 2026-09-17); without
 * the shipper clause such a company was invisible to every user.
 *
 * Response shape preserved: { exporters: [{ id, name, country, contact_email, contact_phone, notes }] }
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
      .or('trading_roles.cs.["seller"],trading_roles.cs.["shipper"],company_types.cs.{exporter}')
      .eq('is_active', true)
      .order('name')

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (country) {
      query = query.eq('country', country)
    }

    const { data: exporters, error } = await query

    if (error) {
      console.error('Error fetching exporters:', error)
      return NextResponse.json({ error: 'Failed to fetch exporters' }, { status: 500 })
    }

    return NextResponse.json({ exporters: exporters || [] })
  } catch (error) {
    console.error('Error in GET /api/exporters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// No POST: companies are added through POST /api/clients, which links an
// existing company instead of duplicating it (spec 2026-11-24 Piece 2).
