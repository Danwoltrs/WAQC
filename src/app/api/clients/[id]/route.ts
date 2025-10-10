import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type ClientUpdate = Database['public']['Tables']['clients']['Update']

/**
 * GET /api/clients/[id]
 * Get a single client by ID
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

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
      }
      console.error('Error fetching client:', error)
      return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 })
    }

    // Get quality spec count for this client
    const { count } = await supabase
      .from('client_qualities')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    return NextResponse.json({
      client: {
        ...(client as any),
        quality_specs_count: count || 0
      }
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/clients/[id]
 * Update a client
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
      .from('clients')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: any = {}
    const allowedFields = [
      'name',
      'company',
      'fantasy_name',
      'vat',
      'address',
      'city',
      'state',
      'country',
      'zip_code',
      'email',
      'phone',
      'contact_person',
      'notes',
      'tracking_number_format',
      'is_active'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update client
    const { data: client, error: updateError } = await supabase
      .from('clients')
      // @ts-expect-error - Supabase type inference issue with update
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating client:', updateError)
      return NextResponse.json({
        error: 'Failed to update client',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ client })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/clients/[id]
 * Delete a client
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

    // Check if client is in use by samples
    const { count: samplesCount } = await supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    if (samplesCount && samplesCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete client that has associated samples',
        sample_count: samplesCount
      }, { status: 400 })
    }

    // Check if client has quality specifications
    const { count: qualityCount } = await supabase
      .from('client_qualities')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', id)

    if (qualityCount && qualityCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete client that has quality specifications. Please delete quality specs first.',
        quality_specs_count: qualityCount
      }, { status: 400 })
    }

    // Delete client
    const { error: deleteError } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting client:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete client',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
