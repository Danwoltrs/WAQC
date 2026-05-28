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
      .select('id, name, country, contact_email:email, contact_phone:phone, notes')
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

/**
 * POST /api/roasters
 * Create a new roaster, or tag an existing company as one.
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
      return NextResponse.json({ error: 'Roaster name is required' }, { status: 400 })
    }

    const trimmedName = body.name.trim()

    const { data: existing } = await (supabase as any)
      .from('companies')
      .select('id, name, country, email, phone, notes, company_types')
      .ilike('name', trimmedName)
      .maybeSingle()

    if (existing) {
      const newCompanyTypes = Array.from(new Set([...(existing.company_types || []), 'roaster']))

      const { data: updated, error: updateError } = await (supabase as any)
        .from('companies')
        .update({
          company_types: newCompanyTypes,
          country: existing.country ?? body.country ?? null,
          email: existing.email ?? body.contact_email ?? null,
          phone: existing.phone ?? body.contact_phone ?? null,
          notes: existing.notes ?? body.notes ?? null,
        })
        .eq('id', existing.id)
        .select('id, name, country, contact_email:email, contact_phone:phone, notes')
        .single()

      if (updateError) {
        console.error('Error tagging existing company as roaster:', updateError)
        return NextResponse.json({ error: 'Failed to update roaster' }, { status: 500 })
      }

      return NextResponse.json({ roaster: updated }, { status: 200 })
    }

    const { data: created, error: insertError } = await (supabase as any)
      .from('companies')
      .insert({
        name: trimmedName,
        country: body.country || null,
        email: body.contact_email || null,
        phone: body.contact_phone || null,
        notes: body.notes || null,
        company_types: ['roaster'],
        trading_roles: [],
        is_active: true,
        is_qc_client: false,
      })
      .select('id, name, country, contact_email:email, contact_phone:phone, notes')
      .single()

    if (insertError) {
      console.error('Error creating roaster:', insertError)
      return NextResponse.json({ error: 'Failed to create roaster' }, { status: 500 })
    }

    return NextResponse.json({ roaster: created }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/roasters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
