import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { activities } from '@/lib/notifications'

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

    // Build query with filters and join with related tables
    // Note: Use explicit relationship names due to multiple FKs to exporters table
    let query = (supabase as any)
      .from('samples')
      .select(`
        *,
        quality_spec:client_qualities(custom_name, quality_code),
        exporter:exporters!samples_exporter_id_fkey(id, name, country),
        importer:importers(id, name, country),
        roaster:roasters(id, name, country)
      `)
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
    let countQuery = (supabase as any)
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

    // Transform samples to include flattened entity names
    const transformedSamples = (samples || []).map((sample: any) => ({
      ...sample,
      // Prioritize sample's own quality_name (for type samples or custom entries),
      // fall back to quality_spec's custom_name
      quality_name: sample.quality_name || sample.quality_spec?.custom_name || null,
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
    }))

    return NextResponse.json({
      samples: transformedSamples,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0)
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
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
    if (!body.laboratory_id || !body.origin || !body.exporter_id) {
      return NextResponse.json({
        error: 'Missing required fields: laboratory_id, origin, exporter_id'
      }, { status: 400 })
    }

    // Client ID is optional - if not provided, use null for tracking number generation
    const clientId = body.client_id || null

    // Generate tracking number using helper function
    // Note: Function signature updated in migration 061 to support lab-specific type sample prefixes
    // TypeScript types will be regenerated in next deployment
    const { data: trackingNumberData, error: trackingError } = await supabase
      .rpc('generate_tracking_number', {
        p_client_id: clientId,
        p_laboratory_id: body.laboratory_id,
        p_origin: body.origin,
        p_quality_template_id: body.quality_spec_id || null,
        p_is_rejected: false,
        p_sample_type: body.sample_type || 'pss'
      } as any)

    if (trackingError) {
      console.error('Error generating tracking number:', trackingError)
      return NextResponse.json({ error: 'Failed to generate tracking number' }, { status: 500 })
    }

    // Extract the tracking number string from the RPC response
    // The RPC call returns the string directly, not wrapped in an object
    const trackingNumber = typeof trackingNumberData === 'string'
      ? trackingNumberData
      : String(trackingNumberData)

    console.log('Generated tracking number:', trackingNumber, 'Type:', typeof trackingNumberData, 'Raw:', trackingNumberData)

    // Calculate bag weight if both quantity and count are provided
    let bagWeightKg: number | null = null
    if (body.bags_quantity_mt && body.bag_count) {
      // Convert MT to kg (multiply by 1000) and divide by bag count
      bagWeightKg = (parseFloat(body.bags_quantity_mt) * 1000) / parseInt(body.bag_count)
      bagWeightKg = Math.round(bagWeightKg * 100) / 100 // Round to 2 decimal places
    }

    // Log quality_name for debugging
    console.log('API received quality_name:', body.quality_name, 'Type:', typeof body.quality_name)

    // Prepare sample data with foreign key IDs
    const sampleData: SampleInsert = {
      tracking_number: trackingNumber,
      client_id: clientId,
      laboratory_id: body.laboratory_id,
      quality_spec_id: body.quality_spec_id || null,
      quality_name: body.quality_name || null,
      hide_exporter_on_label: body.hide_exporter_on_label || false,
      origin: body.origin,
      exporter_id: body.exporter_id,
      exporter_sample_number: body.exporter_sample_number || null,
      importer_id: body.importer_id || null,
      roaster_id: body.roaster_id || null,
      status: body.status || 'received',
      storage_position: body.storage_position || null,
      // Phase 2 fields
      wolthers_contract_nr: body.wolthers_contract_nr || null,
      exporter_contract_nr: body.exporter_contract_nr || null,
      buyer_contract_nr: body.buyer_contract_nr || null,
      roaster_contract_nr: body.roaster_contract_nr || null,
      ico_number: body.ico_number || null,
      container_nr: body.container_nr || null,
      sample_type: body.sample_type || null,
      bags_quantity_mt: body.bags_quantity_mt ? parseFloat(body.bags_quantity_mt) : null,
      bag_count: body.bag_count ? parseInt(body.bag_count) : null,
      bag_weight_kg: body.bag_weight_kg ? parseFloat(body.bag_weight_kg) : null,
      bag_type: body.bag_type || null,
      processing_method: body.processing_method || null,
      workflow_stage: body.workflow_stage || 'received',
      assigned_to: body.assigned_to || null
    }

    console.log('Inserting sample with quality_name:', sampleData.quality_name)

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

    // Get client name for activity logging (only if client_id is provided)
    let clientName = 'Unknown Client'
    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('company')
        .eq('id', clientId)
        .single()

      clientName = client?.company || 'Unknown Client'
    }

    // Log activity
    await activities.sampleRegistered(
      (sample as any).id,
      trackingNumber,
      clientName,
      body.laboratory_id
    )

    return NextResponse.json({ sample }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/samples:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message || String(error)
    }, { status: 500 })
  }
}
