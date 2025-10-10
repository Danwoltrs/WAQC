import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type ClientInsert = Database['public']['Tables']['clients']['Insert']

/**
 * GET /api/clients
 * List all clients with optional filtering
 * Query params: search, limit, offset
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
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,company.ilike.%${search}%,fantasy_name.ilike.%${search}%`)
    }

    const { data: clients, error } = await query

    if (error) {
      console.error('Error fetching clients:', error)
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })

    if (search) {
      countQuery = countQuery.or(`name.ilike.%${search}%,company.ilike.%${search}%,fantasy_name.ilike.%${search}%`)
    }

    const { count } = await countQuery

    return NextResponse.json({
      clients,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    })
  } catch (error) {
    console.error('Error in GET /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients
 * Create a new client
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.company) {
      return NextResponse.json({
        error: 'Missing required fields: name, company'
      }, { status: 400 })
    }

    // Prepare client data
    const clientData: ClientInsert = {
      name: body.name,
      company: body.company,
      fantasy_name: body.fantasy_name || body.company,
      vat: body.vat,
      address: body.address,
      city: body.city,
      state: body.state,
      country: body.country,
      zip_code: body.zip_code,
      email: body.email,
      phone: body.phone,
      contact_person: body.contact_person,
      notes: body.notes,
      tracking_number_format: body.tracking_number_format,
      is_active: body.is_active !== undefined ? body.is_active : true,
      legacy_client_id: body.legacy_client_id // For imported clients
    }

    // Insert client
    const { data: client, error: insertError } = await supabase
      .from('clients')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(clientData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating client:', insertError)
      return NextResponse.json({
        error: 'Failed to create client',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
