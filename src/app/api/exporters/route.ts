import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/exporters
 * List companies that can act as sellers/exporters of coffee.
 * Post-consolidation: reads from companies filtered by
 * trading_roles ⊇ ["seller"] OR company_types ⊇ {exporter}.
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
      .or('trading_roles.cs.["seller"],company_types.cs.{exporter}')
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

/**
 * POST /api/exporters
 * Create a new exporter, or tag an existing company as one.
 * If a company with the same name (case-insensitive) already exists, this
 * adds 'exporter' to its company_types and 'seller' to its trading_roles
 * rather than creating a duplicate.
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
      return NextResponse.json({ error: 'Exporter name is required' }, { status: 400 })
    }

    const trimmedName = body.name.trim()

    // Look for an existing company by case-insensitive name
    const { data: existing } = await (supabase as any)
      .from('companies')
      .select('id, name, country, email, phone, notes, company_types, trading_roles')
      .ilike('name', trimmedName)
      .maybeSingle()

    if (existing) {
      // Add the exporter/seller tags if missing
      const newCompanyTypes = Array.from(new Set([...(existing.company_types || []), 'exporter']))
      const currentRoles: string[] = Array.isArray(existing.trading_roles) ? existing.trading_roles : []
      const newTradingRoles = currentRoles.includes('seller') ? currentRoles : [...currentRoles, 'seller']

      const { data: updated, error: updateError } = await (supabase as any)
        .from('companies')
        .update({
          company_types: newCompanyTypes,
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
        console.error('Error tagging existing company as exporter:', updateError)
        return NextResponse.json({ error: 'Failed to update exporter' }, { status: 500 })
      }

      return NextResponse.json({ exporter: updated }, { status: 200 })
    }

    // Otherwise create a new company tagged as exporter/seller
    const { data: created, error: insertError } = await (supabase as any)
      .from('companies')
      .insert({
        name: trimmedName,
        country: body.country || null,
        email: body.contact_email || null,
        phone: body.contact_phone || null,
        notes: body.notes || null,
        company_types: ['exporter'],
        trading_roles: ['seller'],
        is_active: true,
        is_qc_client: false,
      })
      .select('id, name, country, contact_email:email, contact_phone:phone, notes')
      .single()

    if (insertError) {
      console.error('Error creating exporter:', insertError)
      return NextResponse.json({ error: 'Failed to create exporter' }, { status: 500 })
    }

    return NextResponse.json({ exporter: created }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/exporters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
