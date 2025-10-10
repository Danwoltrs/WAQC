import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

type ClientQualityUpdate = Database['public']['Tables']['client_qualities']['Update']

/**
 * GET /api/client-qualities/[id]
 * Get a single client quality assignment by ID
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

    const { data: clientQuality, error } = await supabase
      .from('client_qualities')
      .select(`
        *,
        client:clients(id, name, company),
        template:quality_templates(id, name, version, parameters)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client quality not found' }, { status: 404 })
      }
      console.error('Error fetching client quality:', error)
      return NextResponse.json({ error: 'Failed to fetch client quality' }, { status: 500 })
    }

    return NextResponse.json({ client_quality: clientQuality })
  } catch (error) {
    console.error('Error in GET /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/client-qualities/[id]
 * Update a client quality assignment
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

    // Check if exists
    const { data: existing, error: fetchError } = await supabase
      .from('client_qualities')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Client quality not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: any = {}
    const allowedFields = ['template_id', 'origin', 'custom_parameters']

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update client quality
    const { data: clientQuality, error: updateError } = await supabase
      .from('client_qualities')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        client:clients(id, name, company),
        template:quality_templates(id, name, version, parameters)
      `)
      .single()

    if (updateError) {
      console.error('Error updating client quality:', updateError)
      return NextResponse.json({
        error: 'Failed to update client quality',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ client_quality: clientQuality })
  } catch (error) {
    console.error('Error in PATCH /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/client-qualities/[id]
 * Delete a client quality assignment
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

    // Check if quality spec is in use by samples
    const { count } = await supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .eq('quality_spec_id', id)

    if (count && count > 0) {
      return NextResponse.json({
        error: 'Cannot delete quality specification that is in use by samples',
        sample_count: count
      }, { status: 400 })
    }

    // Delete client quality
    const { error: deleteError } = await supabase
      .from('client_qualities')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting client quality:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete client quality',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/client-qualities/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
