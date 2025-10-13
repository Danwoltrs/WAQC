import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

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

    // Check for duplicate clients by email
    if (body.email) {
      const { data: duplicates, error: dupError } = await supabase
        .from('clients')
        .select('id, name, company, email')
        .eq('email', body.email)
        .limit(1)

      if (dupError) {
        console.error('Error checking for duplicates:', dupError)
      } else if (duplicates && duplicates.length > 0) {
        return NextResponse.json({
          error: 'Duplicate client detected',
          message: `A client with this email address already exists`,
          existing_client: duplicates[0]
        }, { status: 409 })
      }
    }

    // Prepare client data
    const clientData: ClientInsert = {
      name: body.name,
      company: body.company,
      fantasy_name: body.fantasy_name || body.company,
      address: body.address || '',
      city: body.city,
      state: body.state,
      country: body.country,
      email: body.email,
      phone: body.phone,
      client_types: body.client_types || [], // Array of client types
      is_qc_client: body.is_qc_client !== undefined ? body.is_qc_client : true,
      // Pricing fields
      pricing_model: body.pricing_model || 'per_sample',
      price_per_sample: body.price_per_sample,
      price_per_pound_cents: body.price_per_pound_cents,
      currency: body.currency || 'USD',
      fee_payer: body.fee_payer || 'client_pays',
      payment_terms: body.payment_terms,
      billing_notes: body.billing_notes,
      tracking_number_format: body.tracking_number_format,
      qc_enabled: body.qc_enabled !== undefined ? body.qc_enabled : true,
      company_id: body.company_id, // Link to companies table if imported
      legacy_client_id: body.legacy_client_id // For imported clients
    }

    // Insert client
    const { data: client, error: insertError } = await supabase
      .from('clients')
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
