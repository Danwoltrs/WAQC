import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

type ClientQuality = Database['public']['Tables']['client_qualities']['Row']
type ClientQualityInsert = Database['public']['Tables']['client_qualities']['Insert']

/**
 * GET /api/client-qualities
 * List client quality assignments with optional filtering
 * Query params: client_id, template_id, origin
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
    const client_id = searchParams.get('client_id')
    const template_id = searchParams.get('template_id')
    const origin = searchParams.get('origin')

    // Build query
    let query = supabase
      .from('client_qualities')
      .select(`
        *,
        client:clients(id, name, company),
        template:quality_templates(id, name, version)
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (client_id) query = query.eq('client_id', client_id)
    if (template_id) query = query.eq('template_id', template_id)
    if (origin) query = query.eq('origin', origin)

    const { data: clientQualities, error } = await query

    if (error) {
      console.error('Error fetching client qualities:', error)
      return NextResponse.json({ error: 'Failed to fetch client qualities' }, { status: 500 })
    }

    return NextResponse.json({ client_qualities: clientQualities })
  } catch (error) {
    console.error('Error in GET /api/client-qualities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/client-qualities
 * Assign a quality template to a client
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
    if (!body.client_id || !body.template_id) {
      return NextResponse.json({
        error: 'Missing required fields: client_id, template_id'
      }, { status: 400 })
    }

    // Check if assignment already exists for this client/origin combination
    if (body.origin) {
      const { data: existing } = await supabase
        .from('client_qualities')
        .select('id')
        .eq('client_id', body.client_id)
        .eq('origin', body.origin)
        .single()

      if (existing) {
        return NextResponse.json({
          error: 'Quality specification already exists for this client and origin'
        }, { status: 400 })
      }
    }

    // Prepare client quality data
    const clientQualityData: ClientQualityInsert = {
      client_id: body.client_id,
      template_id: body.template_id,
      origin: body.origin || null,
      custom_parameters: body.custom_parameters || {}
    }

    // Insert client quality assignment
    const { data: clientQuality, error: insertError } = await supabase
      .from('client_qualities')
      .insert(clientQualityData)
      .select(`
        *,
        client:clients(id, name, company),
        template:quality_templates(id, name, version, parameters)
      `)
      .single()

    if (insertError) {
      console.error('Error creating client quality:', insertError)
      return NextResponse.json({
        error: 'Failed to create client quality',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ client_quality: clientQuality }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/client-qualities:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
