import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'

type Sample = Database['public']['Tables']['samples']['Row']
type SampleInsert = Database['public']['Tables']['samples']['Insert']

/**
 * GET /api/samples
 * List samples with optional filtering
 * Query params: status, client_id, laboratory_id, origin, quality_spec_id, sample_type, workflow_stage, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const client_id = searchParams.get('client_id')
    const laboratory_id = searchParams.get('laboratory_id')
    const origin = searchParams.get('origin')
    const quality_spec_id = searchParams.get('quality_spec_id')
    const sample_type = searchParams.get('sample_type')
    const workflow_stage = searchParams.get('workflow_stage')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query with filters
    let query = supabase
      .from('samples')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters if provided
    if (status) query = query.eq('status', status as Database['public']['Enums']['sample_status'])
    if (client_id) query = query.eq('client_id', client_id)
    if (laboratory_id) query = query.eq('laboratory_id', laboratory_id)
    if (origin) query = query.eq('origin', origin)
    if (quality_spec_id) query = query.eq('quality_spec_id', quality_spec_id)
    if (sample_type) query = query.eq('sample_type', sample_type as Database['public']['Enums']['sample_type_enum'])
    if (workflow_stage) query = query.eq('workflow_stage', workflow_stage)

    const { data: samples, error } = await query

    if (error) {
      console.error('Error fetching samples:', error)
      return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('samples')
      .select('*', { count: 'exact', head: true })

    if (status) countQuery = countQuery.eq('status', status as Database['public']['Enums']['sample_status'])
    if (client_id) countQuery = countQuery.eq('client_id', client_id)
    if (laboratory_id) countQuery = countQuery.eq('laboratory_id', laboratory_id)
    if (origin) countQuery = countQuery.eq('origin', origin)
    if (quality_spec_id) countQuery = countQuery.eq('quality_spec_id', quality_spec_id)
    if (sample_type) countQuery = countQuery.eq('sample_type', sample_type as Database['public']['Enums']['sample_type_enum'])
    if (workflow_stage) countQuery = countQuery.eq('workflow_stage', workflow_stage)

    const { count } = await countQuery

    return NextResponse.json({
      samples,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    })
  } catch (error) {
    console.error('Error in GET /api/samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/samples
 * Create a new sample with automatic tracking number generation
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.client_id || !body.laboratory_id || !body.origin || !body.supplier) {
      return NextResponse.json({
        error: 'Missing required fields: client_id, laboratory_id, origin, supplier'
      }, { status: 400 })
    }

    // Generate tracking number using helper function
    const { data: trackingNumberData, error: trackingError } = await supabase
      .rpc('generate_tracking_number', {
        p_client_id: body.client_id,
        p_laboratory_id: body.laboratory_id,
        p_origin: body.origin
      })

    if (trackingError) {
      console.error('Error generating tracking number:', trackingError)
      return NextResponse.json({ error: 'Failed to generate tracking number' }, { status: 500 })
    }

    // Prepare sample data
    const sampleData: SampleInsert = {
      tracking_number: trackingNumberData,
      client_id: body.client_id,
      laboratory_id: body.laboratory_id,
      quality_spec_id: body.quality_spec_id,
      origin: body.origin,
      supplier: body.supplier,
      status: body.status || 'received',
      storage_position: body.storage_position,
      // Phase 2 fields
      wolthers_contract_nr: body.wolthers_contract_nr,
      exporter_contract_nr: body.exporter_contract_nr,
      buyer_contract_nr: body.buyer_contract_nr,
      roaster_contract_nr: body.roaster_contract_nr,
      ico_number: body.ico_number,
      container_nr: body.container_nr,
      sample_type: body.sample_type,
      bags_quantity_mt: body.bags_quantity_mt,
      bag_count: body.bag_count,
      processing_method: body.processing_method,
      workflow_stage: body.workflow_stage || 'received',
      assigned_to: body.assigned_to
    }

    // Validate bag quantities if provided
    if (sampleData.bags_quantity_mt && sampleData.bags_quantity_mt <= 0) {
      return NextResponse.json({ error: 'bags_quantity_mt must be positive' }, { status: 400 })
    }
    if (sampleData.bag_count && sampleData.bag_count <= 0) {
      return NextResponse.json({ error: 'bag_count must be positive' }, { status: 400 })
    }

    // Auto-detect quality specification if not provided
    if (!sampleData.quality_spec_id && body.auto_detect_quality !== false) {
      const { data: qualitySpecs } = await supabase
        .from('client_qualities')
        .select('id')
        .eq('client_id', body.client_id)
        .eq('origin', body.origin)
        .limit(1)
        .single()

      if (qualitySpecs) {
        sampleData.quality_spec_id = (qualitySpecs as any).id
      }
    }

    // Insert sample
    const { data: sample, error: insertError } = await supabase
      .from('samples')
      .insert(sampleData)
      .select()
      .single()

    if (insertError) {
      console.error('Error creating sample:', insertError)
      return NextResponse.json({ error: 'Failed to create sample', details: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ sample }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/samples:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
