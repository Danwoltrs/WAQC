import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

type DefectDefinitionUpdate = Database['public']['Tables']['defect_definitions']['Update']

/**
 * GET /api/defect-definitions/[id]
 * Get a single defect definition by ID
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
      .from('defect_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Defect definition not found' }, { status: 404 })
      }
      console.error('Error fetching defect definition:', error)
      return NextResponse.json({ error: 'Failed to fetch defect definition' }, { status: 500 })
    }

    // Check if defect is being used in any quality assessments
    const { count: usageCount } = await supabase
      .from('quality_assessments')
      .select('id', { count: 'exact', head: true })
      .contains('green_bean_data', { defects: [{ defect_id: id }] })

    return NextResponse.json({
      definition: {
        ...(definition as any),
        usage_count: usageCount || 0,
        in_use: (usageCount || 0) > 0
      }
    })
  } catch (error) {
    console.error('Error in GET /api/defect-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/defect-definitions/[id]
 * Update a defect definition
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

    // Check if defect definition exists
    const { data: existingDefinition, error: fetchError } = await supabase
      .from('defect_definitions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingDefinition) {
      return NextResponse.json({ error: 'Defect definition not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: DefectDefinitionUpdate = {}
    const allowedFields = [
      'name_en', 'name_pt', 'name_es',
      'description_en', 'description_pt', 'description_es',
      'point_value', 'category', 'sample_size_grams', 'is_active', 'origin'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof DefectDefinitionUpdate] = body[field]
      }
    }

    // Validate category if being updated
    if (updateData.category && !['primary', 'secondary'].includes(updateData.category as string)) {
      return NextResponse.json({
        error: 'Category must be either "primary" or "secondary"'
      }, { status: 400 })
    }

    // Validate point_value if being updated
    if (updateData.point_value !== undefined && (typeof updateData.point_value !== 'number' || (updateData.point_value as number) < 0)) {
      return NextResponse.json({
        error: 'point_value must be a positive number'
      }, { status: 400 })
    }

    // Validate sample_size_grams if being updated
    if (updateData.sample_size_grams !== undefined && (typeof updateData.sample_size_grams !== 'number' || (updateData.sample_size_grams as number) <= 0)) {
      return NextResponse.json({
        error: 'sample_size_grams must be a positive number'
      }, { status: 400 })
    }

    // Check for duplicate name if name_en is being changed
    if (updateData.name_en && updateData.name_en !== (existingDefinition as any).name_en) {
      const { data: duplicate } = await supabase
        .from('defect_definitions')
        .select('id')
        .eq('origin', updateData.origin || (existingDefinition as any).origin)
        .eq('name_en', updateData.name_en)
        .eq('client_id', (existingDefinition as any).client_id)
        .neq('id', id)
        .single()

      if (duplicate) {
        return NextResponse.json({
          error: 'A defect definition with this name already exists for this origin and client'
        }, { status: 409 })
      }
    }

    // Update deprecated defect_name field for backward compatibility
    if (updateData.name_en) {
      updateData.defect_name = updateData.name_en as string
    }

    // Update defect definition
    const { data: definition, error: updateError } = await supabase
      .from('defect_definitions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating defect definition:', updateError)
      return NextResponse.json({
        error: 'Failed to update defect definition',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ definition })
  } catch (error) {
    console.error('Error in PATCH /api/defect-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/defect-definitions/[id]
 * Delete a defect definition (only if not in use)
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

    // Check if defect is being used in any quality assessments
    const { count: usageCount } = await supabase
      .from('quality_assessments')
      .select('id', { count: 'exact', head: true })
      .contains('green_bean_data', { defects: [{ defect_id: id }] })

    if (usageCount && usageCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete defect definition that is in use',
        usage_count: usageCount
      }, { status: 400 })
    }

    // Delete defect definition
    const { error: deleteError } = await supabase
      .from('defect_definitions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting defect definition:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete defect definition',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/defect-definitions/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
