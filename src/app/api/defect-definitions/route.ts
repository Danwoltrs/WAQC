import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
// import { Database } from '@/lib/supabase'

// type DefectDefinition = Database['public']['Tables']['defect_definitions']['Row']
// type DefectDefinitionInsert = Database['public']['Tables']['defect_definitions']['Insert']
type DefectDefinition = any // Temporary: Types need to be regenerated
type DefectDefinitionInsert = any // Temporary: Types need to be regenerated

/**
 * GET /api/defect-definitions
 * List all defect definitions with optional filtering
 * Query params: client_id, origin, category, is_active, search, limit, offset
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
    const origin = searchParams.get('origin')
    const category = searchParams.get('category')
    const is_active = searchParams.get('is_active')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('defect_definitions')
      .select('*')
      .order('origin', { ascending: true })
      .order('category', { ascending: true })
      .order('name_en', { ascending: true })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (client_id) {
      query = query.eq('client_id', client_id)
    }

    if (origin) {
      query = query.eq('origin', origin)
    }

    if (category) {
      query = query.eq('category', category)
    }

    if (is_active === 'true') {
      query = query.eq('is_active', true)
    } else if (is_active === 'false') {
      query = query.eq('is_active', false)
    }

    if (search) {
      query = query.or(`name_en.ilike.%${search}%,name_pt.ilike.%${search}%,name_es.ilike.%${search}%,description_en.ilike.%${search}%`)
    }

    const { data: definitions, error } = await query

    if (error) {
      console.error('Error fetching defect definitions:', error)
      return NextResponse.json({ error: 'Failed to fetch defect definitions' }, { status: 500 })
    }

    return NextResponse.json({ definitions })
  } catch (error) {
    console.error('Error in GET /api/defect-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/defect-definitions
 * Create a new defect definition
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
    if (!body.name_en || !body.origin || !body.point_value || !body.category) {
      return NextResponse.json({
        error: 'Missing required fields: name_en, origin, point_value, category'
      }, { status: 400 })
    }

    // Validate category
    if (!['primary', 'secondary'].includes(body.category)) {
      return NextResponse.json({
        error: 'Category must be either "primary" or "secondary"'
      }, { status: 400 })
    }

    // Validate point_value is a positive number
    if (typeof body.point_value !== 'number' || body.point_value < 0) {
      return NextResponse.json({
        error: 'point_value must be a positive number'
      }, { status: 400 })
    }

    // Validate sample_size_grams if provided
    if (body.sample_size_grams !== undefined && (typeof body.sample_size_grams !== 'number' || body.sample_size_grams <= 0)) {
      return NextResponse.json({
        error: 'sample_size_grams must be a positive number'
      }, { status: 400 })
    }

    // Check for duplicate (same client_id, origin, name_en)
    const { data: existing } = await supabase
      .from('defect_definitions')
      .select('id')
      .eq('origin', body.origin)
      .eq('name_en', body.name_en)
      .eq('client_id', body.client_id || null)
      .single()

    if (existing) {
      return NextResponse.json({
        error: 'A defect definition with this name already exists for this origin and client'
      }, { status: 409 })
    }

    // Prepare defect definition data
    const definitionData: DefectDefinitionInsert = {
      client_id: body.client_id || null,
      origin: body.origin,
      name_en: body.name_en,
      name_pt: body.name_pt || body.name_en,
      name_es: body.name_es || body.name_en,
      description_en: body.description_en || null,
      description_pt: body.description_pt || body.description_en || null,
      description_es: body.description_es || body.description_en || null,
      point_value: body.point_value,
      category: body.category,
      sample_size_grams: body.sample_size_grams || 300,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_by: user.id,
      // Keep deprecated defect_name for backward compatibility
      defect_name: body.name_en
    }

    // Insert defect definition
    const { data: definition, error: insertError } = await supabase
      .from('defect_definitions')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(definitionData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating defect definition:', insertError)
      return NextResponse.json({
        error: 'Failed to create defect definition',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ definition }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/defect-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
