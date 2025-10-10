import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type QualityTemplateUpdate = Database['public']['Tables']['quality_templates']['Update']

/**
 * GET /api/quality-templates/[id]
 * Get a single quality template by ID
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

    const { data: template, error } = await supabase
      .from('quality_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      console.error('Error fetching template:', error)
      return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 })
    }

    // Get usage count
    const { count } = await supabase
      .from('client_qualities')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', id)

    // Get version history
    const { data: versions } = await supabase
      .from('template_versions')
      .select('*')
      .eq('template_id', id)
      .order('version_number', { ascending: false })

    return NextResponse.json({
      template: {
        ...(template as any),
        usage_count: count || 0,
        versions: versions || []
      }
    })
  } catch (error) {
    console.error('Error in GET /api/quality-templates/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/quality-templates/[id]
 * Update a quality template
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

    // Check if template exists
    const { data: existingTemplate, error: fetchError } = await supabase
      .from('quality_templates')
      .select('version, parameters')
      .eq('id', id)
      .single()

    if (fetchError || !existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: QualityTemplateUpdate = {}
    const allowedFields = ['name', 'description', 'parameters', 'is_active']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof QualityTemplateUpdate] = body[field]
      }
    }

    // Validate parameters if being updated
    if (updateData.parameters) {
      const validationError = validateTemplateParameters(updateData.parameters)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }
    }

    // Increment version if parameters changed
    let newVersion = (existingTemplate as any).version
    if (updateData.parameters && JSON.stringify(updateData.parameters) !== JSON.stringify((existingTemplate as any).parameters)) {
      newVersion = (existingTemplate as any).version + 1
      updateData.version = newVersion

      // Create new version record
      await supabase
        .from('template_versions')
        // @ts-expect-error - Supabase type inference issue with insert
        .insert({
          template_id: id,
          version_number: newVersion,
          parameters: updateData.parameters,
          changes_description: body.changes_description || 'Parameters updated',
          created_by: user.id
        })
    }

    // Update template
    const { data: template, error: updateError } = await supabase
      .from('quality_templates')
      // @ts-expect-error - Supabase type inference issue with update
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating template:', updateError)
      return NextResponse.json({
        error: 'Failed to update template',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Error in PATCH /api/quality-templates/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/quality-templates/[id]
 * Delete a quality template (only if not in use)
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

    // Check if template is in use
    const { count } = await supabase
      .from('client_qualities')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', id)

    if (count && count > 0) {
      return NextResponse.json({
        error: 'Cannot delete template that is in use',
        usage_count: count
      }, { status: 400 })
    }

    // Delete template
    const { error: deleteError } = await supabase
      .from('quality_templates')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting template:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete template',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/quality-templates/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Validate template parameters structure
 */
function validateTemplateParameters(parameters: any): string | null {
  if (!parameters || typeof parameters !== 'object') {
    return 'Parameters must be an object'
  }

  // Screen sizes validation
  if (parameters.screen_sizes) {
    if (typeof parameters.screen_sizes !== 'object') {
      return 'screen_sizes must be an object'
    }

    if (parameters.screen_sizes.type === 'range') {
      if (!parameters.screen_sizes.min || !parameters.screen_sizes.max) {
        return 'Range screen sizes must have min and max values'
      }
    } else if (parameters.screen_sizes.type === 'specific') {
      if (!parameters.screen_sizes.sizes || !Array.isArray(parameters.screen_sizes.sizes)) {
        return 'Specific screen sizes must be an array'
      }
    }
  }

  // Defects validation
  if (parameters.defects) {
    if (typeof parameters.defects !== 'object') {
      return 'defects must be an object'
    }
    if (parameters.defects.primary_max !== undefined && typeof parameters.defects.primary_max !== 'number') {
      return 'defects.primary_max must be a number'
    }
    if (parameters.defects.secondary_max !== undefined && typeof parameters.defects.secondary_max !== 'number') {
      return 'defects.secondary_max must be a number'
    }
  }

  // Moisture validation
  if (parameters.moisture_max !== undefined) {
    if (typeof parameters.moisture_max !== 'number' || parameters.moisture_max < 0 || parameters.moisture_max > 100) {
      return 'moisture_max must be a number between 0 and 100'
    }
  }

  // Cupping validation
  if (parameters.cupping) {
    if (typeof parameters.cupping !== 'object') {
      return 'cupping must be an object'
    }
    if (parameters.cupping.scale_type && !['1-5', '1-7', '1-10'].includes(parameters.cupping.scale_type)) {
      return 'cupping.scale_type must be one of: 1-5, 1-7, 1-10'
    }
    if (parameters.cupping.min_score !== undefined && typeof parameters.cupping.min_score !== 'number') {
      return 'cupping.min_score must be a number'
    }
    if (parameters.cupping.attributes && !Array.isArray(parameters.cupping.attributes)) {
      return 'cupping.attributes must be an array'
    }
  }

  return null
}
