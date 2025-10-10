import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type ClientQualityUpdate = Database['public']['Tables']['client_qualities']['Update']

/**
 * GET /api/clients/[id]/quality-specifications/[specId]
 * Get a specific quality specification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; specId: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId, specId } = await params

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get quality specification with template details
    const { data: specification, error } = await supabase
      .from('client_qualities')
      .select(`
        *,
        template:quality_templates(*)
      `)
      .eq('id', specId)
      .eq('client_id', clientId)
      .single()

    if (error || !specification) {
      return NextResponse.json({
        error: 'Quality specification not found'
      }, { status: 404 })
    }

    return NextResponse.json({ specification })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/quality-specifications/[specId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/clients/[id]/quality-specifications/[specId]
 * Update a quality specification's custom parameters
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; specId: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId, specId } = await params
    const body = await request.json()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if specification exists and belongs to client
    const { data: existing, error: existingError } = await supabase
      .from('client_qualities')
      .select('id')
      .eq('id', specId)
      .eq('client_id', clientId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({
        error: 'Quality specification not found'
      }, { status: 404 })
    }

    // Check if specification is in use
    if (body.template_id) {
      const { count } = await supabase
        .from('samples')
        .select('*', { count: 'exact', head: true })
        .eq('quality_spec_id', specId)

      if (count && count > 0) {
        return NextResponse.json({
          error: 'Cannot change template: specification is in use by existing samples'
        }, { status: 409 })
      }

      // Verify new template exists
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
    }

    // Prepare update data
    const updateData: ClientQualityUpdate = {}
    if (body.template_id !== undefined) updateData.template_id = body.template_id
    if (body.origin !== undefined) updateData.origin = body.origin
    if (body.custom_parameters !== undefined) updateData.custom_parameters = body.custom_parameters

    // Update specification
    const { data: specification, error: updateError } = await supabase
      .from('client_qualities')
      // @ts-expect-error - Supabase type inference issue with update
      .update(updateData)
      .eq('id', specId)
      .eq('client_id', clientId)
      .select(`
        *,
        template:quality_templates(*)
      `)
      .single()

    if (updateError) {
      console.error('Error updating quality specification:', updateError)
      return NextResponse.json({
        error: 'Failed to update quality specification',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ specification })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]/quality-specifications/[specId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/clients/[id]/quality-specifications/[specId]
 * Delete a quality specification
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; specId: string }> }
) {
  try {
    const supabase = await createClient()
    const { id: clientId, specId } = await params

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if specification is in use
    const { count } = await supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .eq('quality_spec_id', specId)

    if (count && count > 0) {
      return NextResponse.json({
        error: `Cannot delete: specification is in use by ${count} sample(s)`
      }, { status: 409 })
    }

    // Delete specification
    const { error: deleteError } = await supabase
      .from('client_qualities')
      .delete()
      .eq('id', specId)
      .eq('client_id', clientId)

    if (deleteError) {
      console.error('Error deleting quality specification:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete quality specification',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]/quality-specifications/[specId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
