import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
// import { Database } from '@/lib/supabase'

// type TaintFaultDefinitionUpdate = Database['public']['Tables']['taint_fault_definitions']['Update']
type TaintFaultDefinitionUpdate = any // Temporary: Types need to be regenerated

/**
 * GET /api/taint-fault-definitions/[id]
 * Get a single taint/fault definition by ID
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

    const { data: definition, error } = await supabase
      .from('taint_fault_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Taint/fault definition not found' }, { status: 404 })
      }
      console.error('Error fetching taint/fault definition:', error)
      return NextResponse.json({ error: 'Failed to fetch definition' }, { status: 500 })
    }

    // Check if there are client customizations for this definition
    const { data: customizations } = await supabase
      .from('client_taint_fault_customizations')
      .select('client_id, custom_scale, custom_scale_min, custom_scale_max, custom_scale_increment, max_acceptable_score')
      .eq('definition_id', id)

    return NextResponse.json({
      definition: {
        ...(definition as any),
        customizations: customizations || []
      }
    })
  } catch (error) {
    console.error('Error in GET /api/taint-fault-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/taint-fault-definitions/[id]
 * Update a taint/fault definition
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

    const { id } = await params
    const body = await request.json()

    // Check if definition exists
    const { data: existingDefinition, error: fetchError } = await supabase
      .from('taint_fault_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingDefinition) {
      return NextResponse.json({ error: 'Taint/fault definition not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: TaintFaultDefinitionUpdate = {}
    const allowedFields = [
      'name_en', 'name_pt', 'name_es',
      'description_en', 'description_pt', 'description_es',
      'default_scale', 'default_scale_min', 'default_scale_max', 'default_scale_increment',
      'default_threshold', 'tolerance_distinction',
      'origin', 'type', 'is_active'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof TaintFaultDefinitionUpdate] = body[field]
      }
    }

    // Validate type if being updated
    if (updateData.type && !['taint', 'fault'].includes(updateData.type as string)) {
      return NextResponse.json({
        error: 'Type must be either "taint" or "fault"'
      }, { status: 400 })
    }

    // Validate scale configuration if being updated
    if (updateData.default_scale_min !== undefined && updateData.default_scale_max !== undefined) {
      if ((updateData.default_scale_min as number) >= (updateData.default_scale_max as number)) {
        return NextResponse.json({
          error: 'default_scale_min must be less than default_scale_max'
        }, { status: 400 })
      }
    }

    // Check for duplicate name if name_en is being changed
    if (updateData.name_en && updateData.name_en !== (existingDefinition as any).name_en) {
      const { data: duplicate } = await supabase
        .from('taint_fault_definitions')
        .select('id')
        .eq('origin', updateData.origin || (existingDefinition as any).origin)
        .eq('type', updateData.type || (existingDefinition as any).type)
        .eq('name_en', updateData.name_en)
        .eq('client_id', (existingDefinition as any).client_id)
        .neq('id', id)
        .single()

      if (duplicate) {
        return NextResponse.json({
          error: 'A taint/fault definition with this name already exists for this origin and client'
        }, { status: 409 })
      }
    }

    // Update backward compatibility field
    if (updateData.name_en) {
      updateData.name = updateData.name_en as string
    }

    // Update definition
    const { data: definition, error: updateError } = await supabase
      .from('taint_fault_definitions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating taint/fault definition:', updateError)
      return NextResponse.json({
        error: 'Failed to update definition',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ definition })
  } catch (error) {
    console.error('Error in PATCH /api/taint-fault-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/taint-fault-definitions/[id]
 * Delete a taint/fault definition (only if not in use)
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

    const { id } = await params

    // Check if definition has any client customizations
    const { count: customizationCount } = await supabase
      .from('client_taint_fault_customizations')
      .select('id', { count: 'exact', head: true })
      .eq('definition_id', id)

    if (customizationCount && customizationCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete definition that has client customizations',
        customization_count: customizationCount
      }, { status: 400 })
    }

    // Check if definition is used in any template configurations
    const { count: templateCount } = await supabase
      .from('template_taint_fault_config')
      .select('id', { count: 'exact', head: true })
      .eq('definition_id', id)

    if (templateCount && templateCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete definition that is used in quality templates',
        template_count: templateCount
      }, { status: 400 })
    }

    // Delete definition
    const { error: deleteError } = await supabase
      .from('taint_fault_definitions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting taint/fault definition:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete definition',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/taint-fault-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
