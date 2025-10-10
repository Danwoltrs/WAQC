import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type DefectDefinitionInsert = Database['public']['Tables']['defect_definitions']['Insert']

/**
 * GET /api/clients/[id]/defect-definitions
 * Get all defect definitions for a specific client
 * Query params: origin, category, is_active, search
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

    const { id: clientId } = await params
    const searchParams = request.nextUrl.searchParams
    const origin = searchParams.get('origin')
    const category = searchParams.get('category')
    const is_active = searchParams.get('is_active')
    const search = searchParams.get('search')

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Build query for client-specific defects
    let query = supabase
      .from('defect_definitions')
      .select('*')
      .eq('client_id', clientId)
      .order('origin', { ascending: true })
      .order('category', { ascending: true })
      .order('name_en', { ascending: true })

    // Apply filters
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
      query = query.or(`name_en.ilike.%${search}%,name_pt.ilike.%${search}%,name_es.ilike.%${search}%`)
    }

    const { data: definitions, error } = await query

    if (error) {
      console.error('Error fetching client defect definitions:', error)
      return NextResponse.json({ error: 'Failed to fetch defect definitions' }, { status: 500 })
    }

    // Also get global defects for this origin (client_id IS NULL)
    let globalQuery = supabase
      .from('defect_definitions')
      .select('*')
      .is('client_id', null)
      .order('origin', { ascending: true })
      .order('category', { ascending: true })
      .order('name_en', { ascending: true })

    if (origin) {
      globalQuery = globalQuery.eq('origin', origin)
    }

    if (category) {
      globalQuery = globalQuery.eq('category', category)
    }

    if (is_active === 'true') {
      globalQuery = globalQuery.eq('is_active', true)
    }

    const { data: globalDefinitions, error: globalError } = await globalQuery

    if (globalError) {
      console.error('Error fetching global defect definitions:', globalError)
    }

    return NextResponse.json({
      client_definitions: definitions || [],
      global_definitions: globalDefinitions || []
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/defect-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/defect-definitions
 * Create a new defect definition for a specific client
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

    const { id: clientId } = await params
    const body = await request.json()

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

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

    // Validate point_value
    if (typeof body.point_value !== 'number' || body.point_value < 0) {
      return NextResponse.json({
        error: 'point_value must be a positive number'
      }, { status: 400 })
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('defect_definitions')
      .select('id')
      .eq('origin', body.origin)
      .eq('name_en', body.name_en)
      .eq('client_id', clientId)
      .single()

    if (existing) {
      return NextResponse.json({
        error: 'A defect definition with this name already exists for this origin'
      }, { status: 409 })
    }

    // Prepare defect definition data
    const definitionData: DefectDefinitionInsert = {
      client_id: clientId,
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
      console.error('Error creating client defect definition:', insertError)
      return NextResponse.json({
        error: 'Failed to create defect definition',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ definition }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/defect-definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
