import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/supabase'

type SampleUpdate = Database['public']['Tables']['samples']['Update']

/**
 * GET /api/samples/[id]
 * Get a single sample by ID
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

    const { data: sample, error } = await supabase
      .from('samples')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
      }
      console.error('Error fetching sample:', error)
      return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
    }

    return NextResponse.json({ sample })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/samples/[id]
 * Update a sample
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
    const { id } = await params

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
      // @ts-expect-error - Supabase type inference issue with update
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
