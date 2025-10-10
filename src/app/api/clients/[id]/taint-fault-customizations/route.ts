import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type ClientTaintFaultCustomizationInsert = Database['public']['Tables']['client_taint_fault_customizations']['Insert']
type ClientTaintFaultCustomizationUpdate = Database['public']['Tables']['client_taint_fault_customizations']['Update']

/**
 * GET /api/clients/[id]/taint-fault-customizations
 * Get all taint/fault customizations for a specific client
 * Query params: definition_id, origin
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
    const definition_id = searchParams.get('definition_id')
    const origin = searchParams.get('origin')

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Build query for customizations with definition details
    let query = supabase
      .from('client_taint_fault_customizations')
      .select(`
        *,
        definition:taint_fault_definitions(*)
      `)
      .eq('client_id', clientId)

    // Apply filters
    if (definition_id) {
      query = query.eq('definition_id', definition_id)
    }

    const { data: customizations, error } = await query

    if (error) {
      console.error('Error fetching client taint/fault customizations:', error)
      return NextResponse.json({ error: 'Failed to fetch customizations' }, { status: 500 })
    }

    // Filter by origin if provided (filtering on joined data)
    let filteredCustomizations = customizations || []
    if (origin && filteredCustomizations.length > 0) {
      filteredCustomizations = filteredCustomizations.filter((c: any) => c.definition?.origin === origin)
    }

    return NextResponse.json({ customizations: filteredCustomizations })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/taint-fault-customizations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/taint-fault-customizations
 * Create a new taint/fault customization for a client
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

    // Validate required field
    if (!body.definition_id) {
      return NextResponse.json({
        error: 'Missing required field: definition_id'
      }, { status: 400 })
    }

    // Verify definition exists
    const { data: definition, error: defError } = await supabase
      .from('taint_fault_definitions')
      .select('id')
      .eq('id', body.definition_id)
      .single()

    if (defError || !definition) {
      return NextResponse.json({ error: 'Taint/fault definition not found' }, { status: 404 })
    }

    // Validate scale configuration if provided
    if (body.custom_scale_min !== undefined && body.custom_scale_max !== undefined) {
      if (body.custom_scale_min >= body.custom_scale_max) {
        return NextResponse.json({
          error: 'custom_scale_min must be less than custom_scale_max'
        }, { status: 400 })
      }
    }

    // Check for existing customization
    const { data: existing } = await supabase
      .from('client_taint_fault_customizations')
      .select('id')
      .eq('client_id', clientId)
      .eq('definition_id', body.definition_id)
      .single()

    if (existing) {
      return NextResponse.json({
        error: 'A customization for this definition already exists for this client'
      }, { status: 409 })
    }

    // Prepare customization data
    const customizationData: ClientTaintFaultCustomizationInsert = {
      client_id: clientId,
      definition_id: body.definition_id,
      custom_scale: body.custom_scale || null,
      custom_scale_min: body.custom_scale_min || null,
      custom_scale_max: body.custom_scale_max || null,
      custom_scale_increment: body.custom_scale_increment || null,
      max_acceptable_score: body.max_acceptable_score || null,
      custom_description_en: body.custom_description_en || null,
      custom_description_pt: body.custom_description_pt || null,
      custom_description_es: body.custom_description_es || null,
      is_tolerance_counted: body.is_tolerance_counted !== undefined ? body.is_tolerance_counted : true,
      created_by: user.id
    }

    // Insert customization
    const { data: customization, error: insertError } = await supabase
      .from('client_taint_fault_customizations')
      // @ts-expect-error - Supabase type inference issue with insert
      .insert(customizationData)
      .select(`
        *,
        definition:taint_fault_definitions(*)
      `)
      .single()

    if (insertError) {
      console.error('Error creating client taint/fault customization:', insertError)
      return NextResponse.json({
        error: 'Failed to create customization',
        details: insertError.message
      }, { status: 500 })
    }

    return NextResponse.json({ customization }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/taint-fault-customizations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/clients/[id]/taint-fault-customizations
 * Update a client's taint/fault customization
 * Requires customization_id in body
 */
export async function PATCH(
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

    if (!body.customization_id) {
      return NextResponse.json({
        error: 'Missing required field: customization_id'
      }, { status: 400 })
    }

    // Check if customization exists and belongs to this client
    const { data: existingCustomization, error: fetchError } = await supabase
      .from('client_taint_fault_customizations')
      .select('*')
      .eq('id', body.customization_id)
      .eq('client_id', clientId)
      .single()

    if (fetchError || !existingCustomization) {
      return NextResponse.json({ error: 'Customization not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: ClientTaintFaultCustomizationUpdate = {}
    const allowedFields = [
      'custom_scale', 'custom_scale_min', 'custom_scale_max', 'custom_scale_increment',
      'max_acceptable_score',
      'custom_description_en', 'custom_description_pt', 'custom_description_es',
      'is_tolerance_counted'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof ClientTaintFaultCustomizationUpdate] = body[field]
      }
    }

    // Validate scale configuration if being updated
    if (updateData.custom_scale_min !== undefined && updateData.custom_scale_max !== undefined) {
      if ((updateData.custom_scale_min as number) >= (updateData.custom_scale_max as number)) {
        return NextResponse.json({
          error: 'custom_scale_min must be less than custom_scale_max'
        }, { status: 400 })
      }
    }

    // Update customization
    const { data: customization, error: updateError } = await supabase
      .from('client_taint_fault_customizations')
      // @ts-expect-error - Supabase type inference issue with update
      .update(updateData)
      .eq('id', body.customization_id)
      .eq('client_id', clientId)
      .select(`
        *,
        definition:taint_fault_definitions(*)
      `)
      .single()

    if (updateError) {
      console.error('Error updating client taint/fault customization:', updateError)
      return NextResponse.json({
        error: 'Failed to update customization',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ customization })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]/taint-fault-customizations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/clients/[id]/taint-fault-customizations
 * Delete a client's taint/fault customization
 * Requires customization_id in query params
 */
export async function DELETE(
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
    const customization_id = searchParams.get('customization_id')

    if (!customization_id) {
      return NextResponse.json({
        error: 'Missing required parameter: customization_id'
      }, { status: 400 })
    }

    // Verify customization exists and belongs to this client
    const { data: existing, error: fetchError } = await supabase
      .from('client_taint_fault_customizations')
      .select('id')
      .eq('id', customization_id)
      .eq('client_id', clientId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Customization not found' }, { status: 404 })
    }

    // Delete customization
    const { error: deleteError } = await supabase
      .from('client_taint_fault_customizations')
      .delete()
      .eq('id', customization_id)
      .eq('client_id', clientId)

    if (deleteError) {
      console.error('Error deleting client taint/fault customization:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete customization',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]/taint-fault-customizations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
