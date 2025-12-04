import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { isUUID, slugToTrackingNumber } from '@/lib/utils'
import { resolveSampleId } from '@/lib/sample-utils'

type SampleUpdate = Database['public']['Tables']['samples']['Update']

/**
 * GET /api/samples/[id]
 * Get a single sample by ID (UUID) or tracking number slug
 * Supports: UUID like 89ed925b-65d2-4a1c-8dd3-db18447b4e4b
 * Or tracking number slug like SAK-048524_25 (converted from SAK-048524/25)
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

    // Await params (Next.js 15)
    const { id } = await params

    // Determine if id is a UUID or tracking number slug
    const lookupByUUID = isUUID(id)
    const trackingNumber = lookupByUUID ? null : slugToTrackingNumber(id)

    let query = supabase
      .from('samples')
      .select(`
        *,
        quality_spec:client_qualities(custom_name, quality_code),
        exporter:exporters!samples_exporter_id_fkey(id, name, country),
        importer:importers(id, name, country),
        roaster:roasters(id, name, country)
      `)

    // Query by UUID or tracking number
    if (lookupByUUID) {
      query = query.eq('id', id)
    } else {
      query = query.eq('tracking_number', trackingNumber!)
    }

    const { data: sample, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
      }
      console.error('Error fetching sample:', error)
      return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
    }

    // Transform sample to include flattened entity names (matching list API format)
    const transformedSample = {
      ...sample,
      quality_name: sample.quality_spec?.custom_name || null,
      quality_code: sample.quality_spec?.quality_code || null,
      exporter_name: sample.exporter?.name || null,
      exporter_country: sample.exporter?.country || null,
      importer_name: sample.importer?.name || null,
      importer_country: sample.importer?.country || null,
      roaster_name: sample.roaster?.name || null,
      roaster_country: sample.roaster?.country || null,
      // Remove nested objects to keep response clean
      quality_spec: undefined,
      exporter: undefined,
      importer: undefined,
      roaster: undefined
    }

    return NextResponse.json({ sample: transformedSample })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/samples/[id]
 * Update a sample (supports UUID or tracking number slug)
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

    // Await params (Next.js 15)
    const { id: idOrSlug } = await params

    // Resolve to UUID
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    const body = await request.json()

    // Validate that sample exists first
    const { data: existingSample, error: fetchError } = await supabase
      .from('samples')
      .select('id, workflow_stage')
      .eq('id', id)
      .single()

    if (fetchError || !existingSample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData: SampleUpdate = {}

    // Allow updating these fields
    const allowedFields = [
      'client_id',
      'laboratory_id',
      'quality_spec_id',
      'origin',
      'supplier',
      'status',
      'storage_position',
      'wolthers_contract_nr',
      'exporter_contract_nr',
      'buyer_contract_nr',
      'roaster_contract_nr',
      'ico_number',
      'container_nr',
      'sample_type',
      'bags_quantity_mt',
      'bag_count',
      'processing_method',
      'workflow_stage',
      'assigned_to'
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field as keyof SampleUpdate] = body[field]
      }
    }

    // Validate bag quantities if being updated
    if (updateData.bags_quantity_mt && updateData.bags_quantity_mt <= 0) {
      return NextResponse.json({ error: 'bags_quantity_mt must be positive' }, { status: 400 })
    }
    if (updateData.bag_count && updateData.bag_count <= 0) {
      return NextResponse.json({ error: 'bag_count must be positive' }, { status: 400 })
    }

    // Update sample
    const { data: sample, error: updateError } = await supabase
      .from('samples')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      // Check for workflow stage validation error
      if (updateError.message?.includes('Invalid workflow stage transition')) {
        return NextResponse.json({
          error: 'Invalid workflow stage transition',
          details: updateError.message
        }, { status: 400 })
      }

      console.error('Error updating sample:', updateError)
      return NextResponse.json({
        error: 'Failed to update sample',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({ sample })
  } catch (error) {
    console.error('Error in PATCH /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/samples/[id]
 * Soft delete a sample (global admins only, supports UUID or tracking number slug)
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

    // Check if user is a global admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_global_admin, qc_role')
      .eq('id', user.id)
      .single()

    if (!profile?.is_global_admin && profile?.qc_role !== 'global_admin') {
      return NextResponse.json({
        error: 'Forbidden: Only global admins can delete samples'
      }, { status: 403 })
    }

    // Await params (Next.js 15)
    const { id: idOrSlug } = await params

    // Resolve to UUID
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    // Check if sample exists and is not already deleted
    const { data: existingSample, error: fetchError } = await supabase
      .from('samples')
      .select('id, tracking_number, deleted_at')
      .eq('id', id)
      .single()

    if (fetchError || !existingSample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    if (existingSample.deleted_at) {
      return NextResponse.json({
        error: 'Sample already deleted',
        deleted_at: existingSample.deleted_at
      }, { status: 400 })
    }

    // Soft delete the sample by setting deleted_at and deleted_by
    const { error: deleteError } = await supabase
      .from('samples')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id
      })
      .eq('id', id)

    if (deleteError) {
      console.error('Error soft deleting sample:', deleteError)
      return NextResponse.json({
        error: 'Failed to delete sample',
        details: deleteError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Sample ${existingSample.tracking_number} deleted successfully`,
      deleted_by: user.id,
      deleted_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error in DELETE /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
