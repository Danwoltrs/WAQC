import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
// import { Database } from '@/lib/supabase'

// type TaintFaultDefinition = Database['public']['Tables']['taint_fault_definitions']['Row']
// type TaintFaultDefinitionInsert = Database['public']['Tables']['taint_fault_definitions']['Insert']
type TaintFaultDefinition = any // Temporary: Types need to be regenerated
type TaintFaultDefinitionInsert = any // Temporary: Types need to be regenerated

/**
 * GET /api/taint-fault-definitions
 * List all taint/fault definitions with optional filtering
 * Query params: origin, type, is_active, client_id, search, limit, offset
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
    const origin = searchParams.get('origin')
    const type = searchParams.get('type')
    const is_active = searchParams.get('is_active')
    const client_id = searchParams.get('client_id')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('taint_fault_definitions')
      .select('*')
      .order('origin', { ascending: true })
      .order('type', { ascending: true })
      .order('name_en', { ascending: true })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (origin) {
      query = query.eq('origin', origin)
    }

    if (type) {
      query = query.eq('type', type)
    }

    if (is_active === 'true') {
      query = query.eq('is_active', true)
    } else if (is_active === 'false') {
      query = query.eq('is_active', false)
    }

    if (client_id) {
      query = query.eq('client_id', client_id)
    }

    if (search) {
      query = query.or(`name_en.ilike.%${search}%,name_pt.ilike.%${search}%,name_es.ilike.%${search}%,description_en.ilike.%${search}%`)
    }

    const { data: definitions, error } = await query

    if (error) {
      console.error('Error fetching taint/fault definitions:', error)
      return NextResponse.json({ error: 'Failed to fetch taint/fault definitions' }, { status: 500 })
    }

    return NextResponse.json({ definitions })
  } catch (error) {
    console.error('Error in GET /api/taint-fault-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/taint-fault-definitions
 * Create a new taint/fault definition
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
    if (!body.name_en || !body.origin || !body.type) {
      return NextResponse.json({
        error: 'Missing required fields: name_en, origin, type'
      }, { status: 400 })
    }

    // Validate type
    if (!['taint', 'fault'].includes(body.type)) {
      return NextResponse.json({
        error: 'Type must be either "taint" or "fault"'
      }, { status: 400 })
    }

    // Validate scale configuration if provided
    if (body.default_scale_min !== undefined && body.default_scale_max !== undefined) {
      if (body.default_scale_min >= body.default_scale_max) {
        return NextResponse.json({
          error: 'default_scale_min must be less than default_scale_max'
        }, { status: 400 })
      }
    }

    // Check for duplicate (same origin, type, name_en, client_id)
    const { data: existing } = await supabase
      .from('taint_fault_definitions')
      .select('id')
      .eq('origin', body.origin)
      .eq('type', body.type)
      .eq('name_en', body.name_en)
      .eq('client_id', body.client_id || null)
      .single()

    if (existing) {
      return NextResponse.json({
        error: 'A taint/fault definition with this name already exists for this origin and client'
      }, { status: 409 })
    }

    // Prepare definition data
    const definitionData: TaintFaultDefinitionInsert = {
      origin: body.origin,
      type: body.type,
      name_en: body.name_en,
      name_pt: body.name_pt || body.name_en,
      name_es: body.name_es || body.name_en,
      description_en: body.description_en || null,
      description_pt: body.description_pt || body.description_en || null,
      description_es: body.description_es || body.description_en || null,
      default_scale: body.default_scale || '1-5',
      default_scale_min: body.default_scale_min || 1.00,
      default_scale_max: body.default_scale_max || 5.00,
      default_scale_increment: body.default_scale_increment || 0.25,
      default_threshold: body.default_threshold || null,
      tolerance_distinction: body.tolerance_distinction || false,
      client_id: body.client_id || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_by: user.id,
      // Keep deprecated fields for backward compatibility
      name: body.name_en,
      severity_levels: body.severity_levels || []
    }

    // Insert definition
    const { data: definition, error: insertError } = await supabase
      .from('taint_fault_definitions')
      .insert(definitionData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating taint/fault definition:', insertError)
      return NextResponse.json({
        error: 'Failed to create taint/fault definition',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ definition }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/taint-fault-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
