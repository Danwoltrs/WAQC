import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/clients/[id]/origin-pricing
 * Get all origin pricing tiers for a client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check if client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, has_origin_pricing')
      .eq('id', id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Fetch all origin pricing for this client
    const { data: originPricing, error } = await supabase
      .from('client_origin_pricing')
      .select('*')
      .eq('client_id', id)
      .order('origin', { ascending: true })

    if (error) {
      console.error('Error fetching origin pricing:', error)
      return NextResponse.json({ error: 'Failed to fetch origin pricing' }, { status: 500 })
    }

    return NextResponse.json({
      client_id: id,
      has_origin_pricing: client.has_origin_pricing,
      origin_pricing: originPricing || [],
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/origin-pricing:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/origin-pricing
 * Add or update origin-specific pricing for a client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    const { origin, pricing_model, price_per_sample, price_per_pound_cents, currency, is_active } = body

    // Validate required fields
    if (!origin || !pricing_model) {
      return NextResponse.json({
        error: 'Missing required fields: origin and pricing_model are required'
      }, { status: 400 })
    }

    // Validate pricing model specific fields
    if (pricing_model === 'per_sample' && !price_per_sample) {
      return NextResponse.json({
        error: 'price_per_sample is required for per_sample pricing model'
      }, { status: 400 })
    }

    if (pricing_model === 'per_pound' && (!price_per_pound_cents || price_per_pound_cents < 0.25)) {
      return NextResponse.json({
        error: 'price_per_pound_cents is required and must be at least 0.25¢ for per_pound pricing model'
      }, { status: 400 })
    }

    // Check if client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', id)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Upsert origin pricing (insert or update if exists)
    const { data: originPricing, error: upsertError } = await supabase
      .from('client_origin_pricing')
      .upsert({
        client_id: id,
        origin,
        pricing_model,
        price_per_sample: pricing_model === 'per_sample' ? price_per_sample : null,
        price_per_pound_cents: pricing_model === 'per_pound' ? price_per_pound_cents : null,
        currency: currency || 'USD',
        is_active: is_active !== undefined ? is_active : true,
      }, {
        onConflict: 'client_id,origin'
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Error upserting origin pricing:', upsertError)
      return NextResponse.json({
        error: 'Failed to save origin pricing',
        details: upsertError.message
      }, { status: 500 })
    }

    // Update client to mark it has origin pricing
    await supabase
      .from('clients')
      .update({ has_origin_pricing: true })
      .eq('id', id)

    return NextResponse.json({ origin_pricing: originPricing })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/origin-pricing:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
