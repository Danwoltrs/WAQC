import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type ClientQuality = Database['public']['Tables']['client_qualities']['Row']
type ClientQualityInsert = Database['public']['Tables']['client_qualities']['Insert']
type ClientQualityUpdate = Database['public']['Tables']['client_qualities']['Update']

/**
 * GET /api/clients/[id]/quality-specifications
 * Get all quality specifications assigned to a client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId } = await params

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get client quality specifications with template details
    const { data: specifications, error } = await supabase
      .from('client_qualities')
      .select(`
        *,
        template:quality_templates(*)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching client quality specifications:', error)
      return NextResponse.json({
        error: 'Failed to fetch quality specifications'
      }, { status: 500 })
    }

    return NextResponse.json({ specifications })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/quality-specifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/quality-specifications
 * Assign a quality specification template to a client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId } = await params
    const body = await request.json()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate required fields
    if (!body.template_id) {
      return NextResponse.json({
        error: 'Missing required field: template_id'
      }, { status: 400 })
    }

    // Check if template exists
    const { data: template, error: templateError } = await supabase
      .from('quality_templates')
      .select('id')
      .eq('id', body.template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({
        error: 'Invalid template_id: template not found'
      }, { status: 404 })
    }

    // Check for duplicate (same client, template, and origin)
    let duplicateQuery = supabase
      .from('client_qualities')
      .select('id')
      .eq('client_id', clientId)
      .eq('template_id', body.template_id)

    if (body.origin) {
      duplicateQuery = duplicateQuery.eq('origin', body.origin)
    } else {
      duplicateQuery = duplicateQuery.is('origin', null)
    }

    const { data: existing } = await duplicateQuery.single()

    if (existing) {
      return NextResponse.json({
        error: 'This template is already assigned to this client' + (body.origin ? ` for origin: ${body.origin}` : '')
      }, { status: 409 })
    }

    // Prepare client quality data
    const qualityData: ClientQualityInsert = {
      client_id: clientId,
      template_id: body.template_id,
      origin: body.origin || null,
      custom_parameters: body.custom_parameters || {}
    }

    // Insert client quality specification
    const { data: specification, error: insertError } = await supabase
      .from('client_qualities')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(qualityData)
      .select(`
        *,
        template:quality_templates(*)
      `)
      .single()

    if (insertError) {
      console.error('Error creating client quality specification:', insertError)
      return NextResponse.json({
        error: 'Failed to create quality specification',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ specification }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/quality-specifications:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
