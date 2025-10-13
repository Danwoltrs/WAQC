import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

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

    // Fetch associated samples with recent history
    const { data: samples, error: samplesError } = await supabase
      .from('samples')
      .select('id, tracking_number, origin, status, created_at, quality_spec_id')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (samplesError) {
      console.error('Error fetching samples:', samplesError)
    }

    // Calculate sample metrics
    const sampleMetrics = {
      total: samples?.length || 0,
      received: samples?.filter((s: any) => s.status === 'received').length || 0,
      in_progress: samples?.filter((s: any) => s.status === 'in_progress').length || 0,
      under_review: samples?.filter((s: any) => s.status === 'under_review').length || 0,
      approved: samples?.filter((s: any) => s.status === 'approved').length || 0,
      rejected: samples?.filter((s: any) => s.status === 'rejected').length || 0,
    }

    // Fetch quality specifications assigned to this client
    const { data: qualitySpecs, error: specsError } = await supabase
      .from('client_qualities')
      .select(`
        id,
        origin,
        custom_parameters,
        created_at,
        template:quality_templates (
          id,
          name,
          description,
          parameters
        )
      `)
      .eq('client_id', id)

    if (specsError) {
      console.error('Error fetching quality specs:', specsError)
    }

    // Fetch certificates count
    const { count: certificatesCount, error: certsError } = await supabase
      .from('certificates')
      .select('*', { count: 'exact', head: true })
      .in('sample_id', samples?.map((s: any) => s.id) || [])

    if (certsError) {
      console.error('Error fetching certificates count:', certsError)
    }

    return NextResponse.json({
      client,
      samples: samples || [],
      sampleMetrics,
      qualitySpecs: qualitySpecs || [],
      certificatesCount: certificatesCount || 0,
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
      'address',
      'city',
      'state',
      'country',
      'email',
      'phone',
      'client_types',
      'is_qc_client',
      'pricing_model',
      'price_per_sample',
      'price_per_pound_cents',
      'currency',
      'fee_payer',
      'payment_terms',
      'billing_notes',
      'tracking_number_format',
      'qc_enabled',
      'company_id',
      'legacy_client_id'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Update client
    const { data: client, error: updateError } = await supabase
      .from('clients')
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
