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
      .select('id, name, country, contact_email:email, contact_phone:phone, notes')
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

/**
 * POST /api/importers
 * Create a new importer, or tag an existing company as one.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: 'Importer name is required' }, { status: 400 })
    }

    const trimmedName = body.name.trim()

    const { data: existing } = await (supabase as any)
      .from('companies')
      .select('id, name, country, email, phone, notes, trading_roles')
      .ilike('name', trimmedName)
      .maybeSingle()

    if (existing) {
      const currentRoles: string[] = Array.isArray(existing.trading_roles) ? existing.trading_roles : []
      const newTradingRoles = currentRoles.includes('buyer') ? currentRoles : [...currentRoles, 'buyer']

      const { data: updated, error: updateError } = await (supabase as any)
        .from('companies')
        .update({
          trading_roles: newTradingRoles,
          country: existing.country ?? body.country ?? null,
          email: existing.email ?? body.contact_email ?? null,
          phone: existing.phone ?? body.contact_phone ?? null,
          notes: existing.notes ?? body.notes ?? null,
        })
        .eq('id', existing.id)
        .select('id, name, country, contact_email:email, contact_phone:phone, notes')
        .single()

      if (updateError) {
        console.error('Error tagging existing company as importer:', updateError)
        return NextResponse.json({ error: 'Failed to update importer' }, { status: 500 })
      }

      return NextResponse.json({ importer: updated }, { status: 200 })
    }

    const { data: created, error: insertError } = await (supabase as any)
      .from('companies')
      .insert({
        name: trimmedName,
        country: body.country || null,
        email: body.contact_email || null,
        phone: body.contact_phone || null,
        notes: body.notes || null,
        company_types: [],
        trading_roles: ['buyer'],
        is_active: true,
        is_qc_client: false,
      })
      .select('id, name, country, contact_email:email, contact_phone:phone, notes')
      .single()

    if (insertError) {
      console.error('Error creating importer:', insertError)
      return NextResponse.json({ error: 'Failed to create importer' }, { status: 500 })
    }

    return NextResponse.json({ importer: created }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/importers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
