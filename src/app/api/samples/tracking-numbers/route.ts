import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

/**
 * POST /api/samples/tracking-numbers
 * Generate a tracking number for a specific client and laboratory
 * Supports client-specific formats like Dunkin (B-12345-25) and Ahold (SAG-12345-25)
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
    const { client_id, laboratory_id, origin } = body

    if (!client_id || !laboratory_id) {
      return NextResponse.json({
        error: 'Missing required fields: client_id, laboratory_id'
      }, { status: 400 })
    }

    // Generate tracking number using database function
    const { data: trackingNumber, error: generationError } = await supabase
      // @ts-expect-error - Supabase type inference issue with rpc
      .rpc('generate_tracking_number', {
        p_client_id: client_id,
        p_laboratory_id: laboratory_id,
        p_origin: origin || null
      })

    if (generationError) {
      console.error('Error generating tracking number:', generationError)
      return NextResponse.json({
        error: 'Failed to generate tracking number',
        details: generationError.message
      }, { status: 500 })
    }

    // Get client info to show format being used
    const { data: client } = await supabase
      .from('clients')
      .select('name, company, tracking_number_format')
      .eq('id', client_id)
      .single()

    return NextResponse.json({
      tracking_number: trackingNumber,
      client: (client as any)?.company || 'Unknown',
      format_used: (client as any)?.tracking_number_format || 'WAQC-{lab}-{year}-{seq:05d}'
    })
  } catch (error) {
    console.error('Error in POST /api/samples/tracking-numbers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/samples/tracking-numbers/validate
 * Validate a tracking number format for a specific client
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
    const tracking_number = searchParams.get('tracking_number')

    if (!tracking_number) {
      return NextResponse.json({
        error: 'Missing tracking_number parameter'
      }, { status: 400 })
    }

    // Check if tracking number exists
    const { data: sample, error: lookupError } = await supabase
      .from('samples')
      .select('id, tracking_number, client_id, laboratory_id, created_at')
      .eq('tracking_number', tracking_number)
      .single()

    if (lookupError || !sample) {
      return NextResponse.json({
        valid: false,
        exists: false,
        tracking_number
      })
    }

    return NextResponse.json({
      valid: true,
      exists: true,
      tracking_number: (sample as any).tracking_number,
      sample_id: (sample as any).id,
      created_at: (sample as any).created_at
    })
  } catch (error) {
    console.error('Error in GET /api/samples/tracking-numbers/validate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
