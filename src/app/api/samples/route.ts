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
    // Filter out soft-deleted samples (deleted_at is set on soft delete)
    // Include certificate info for samples that have certificates
    let query = (supabase as any)
      .from('samples')
      .select(`
        *,
        quality_spec:client_qualities(custom_name, quality_code),
        seller:exporters!samples_seller_id_fkey(id, name, country),
        exporter:exporters!samples_exporter_id_fkey(id, name, country),
        importer:importers(id, name, country),
        roaster:roasters(id, name, country),
        qc_client:clients!samples_client_id_fkey(id, company, fantasy_name, country),
        end_client:clients!samples_end_client_id_fkey(id, company, fantasy_name, country),
        certificate:certificates(id, certificate_number, status, created_at)
      `)
      .is('deleted_at', null)
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

    // Get total count for pagination (exclude soft-deleted samples)
    let countQuery = (supabase as any)
      .from('samples')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)

    if (status) countQuery = countQuery.eq('status', status as Database['public']['Enums']['sample_status'])
    if (client_id) countQuery = countQuery.eq('client_id', client_id)
    if (laboratory_id) countQuery = countQuery.eq('laboratory_id', laboratory_id)
    if (origin) countQuery = countQuery.eq('origin', origin)
    if (quality_spec_id) countQuery = countQuery.eq('quality_spec_id', quality_spec_id)
    if (sample_type) countQuery = countQuery.eq('sample_type', sample_type as Database['public']['Enums']['sample_type_enum'])
    if (workflow_stage) countQuery = countQuery.eq('workflow_stage', workflow_stage)

    const { count } = await countQuery

    // Transform samples to include flattened entity names
    const transformedSamples = (samples || []).map((sample: any) => {
      // Handle certificate array - Supabase returns array for one-to-many relations
      // A sample can have at most one certificate, so we take the first one
      const certificate = Array.isArray(sample.certificate)
        ? sample.certificate[0] || null
        : sample.certificate || null

      return {
        ...sample,
        // Prioritize sample's own quality_name (for type samples or custom entries),
        // fall back to quality_spec's custom_name
        quality_name: sample.quality_name || sample.quality_spec?.custom_name || null,
        quality_code: sample.quality_spec?.quality_code || null,
        // Seller (farm/producer) from seller_id
        seller_name: sample.seller?.name || null,
        seller_country: sample.seller?.country || null,
        // Exporter/Shipper from exporter_id
        exporter_name: sample.exporter?.name || null,
        exporter_country: sample.exporter?.country || null,
        importer_name: sample.importer?.name || (sample.importer_is_qc_client ? (sample.qc_client?.fantasy_name || sample.qc_client?.company) : null),
        importer_country: sample.importer?.country || (sample.importer_is_qc_client ? sample.qc_client?.country : null),
        roaster_name: sample.roaster?.name || null,
        roaster_country: sample.roaster?.country || null,
        // QC Client (who hired Wolthers) from client_id
        qc_client_name: sample.qc_client?.fantasy_name || sample.qc_client?.company || null,
        qc_client_country: sample.qc_client?.country || null,
        // End client (final buyer) - when NULL, QC client IS the end client
        end_client_name: sample.end_client?.fantasy_name || sample.end_client?.company || null,
        end_client_country: sample.end_client?.country || null,
        // Certificate info (flattened)
        certificate_id: certificate?.id || null,
        certificate_number: certificate?.certificate_number || null,
        certificate_status: certificate?.status || null,
        certificate_created_at: certificate?.created_at || null,
        // Remove nested objects to keep response clean
        quality_spec: undefined,
        seller: undefined,
        exporter: undefined,
        importer: undefined,
        roaster: undefined,
        qc_client: undefined,
        end_client: undefined,
        certificate: undefined
      }
    })

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

    // Validate required fields (exporter_id is optional since it's from a soft name lookup)
    if (!body.laboratory_id || !body.origin) {
      const missing = []
      if (!body.laboratory_id) missing.push('laboratory_id')
      if (!body.origin) missing.push('origin')
      return NextResponse.json({
        error: `Missing required fields: ${missing.join(', ')}`
      }, { status: 400 })
    }

    // Client ID is optional - if not provided, use null for tracking number generation
    const clientId = body.client_id || null

    // Use provided bag weight, only calculate if not provided and we have quantity + count
    let bagWeightKg: number | null = body.bag_weight_kg ? parseFloat(body.bag_weight_kg) : null
    if (!bagWeightKg && body.bags_quantity_mt && body.bag_count && body.bag_type !== 'bulk') {
      bagWeightKg = (parseFloat(body.bags_quantity_mt) * 1000) / parseInt(body.bag_count)
      bagWeightKg = Math.round(bagWeightKg * 100) / 100
    }

    // Validate bag quantities
    const bagsQuantityMt = body.bags_quantity_mt ? parseFloat(body.bags_quantity_mt) : null
    const bagCount = body.bag_count ? parseInt(body.bag_count) : null
    if (bagsQuantityMt && bagsQuantityMt <= 0) {
      return NextResponse.json({ error: 'bags_quantity_mt must be positive' }, { status: 400 })
    }
    if (bagCount && bagCount <= 0) {
      return NextResponse.json({ error: 'bag_count must be positive' }, { status: 400 })
    }

    // Auto-detect quality specification if not provided
    let qualitySpecId = body.quality_spec_id || null
    if (!qualitySpecId && body.auto_detect_quality !== false && body.client_id) {
      const { data: qualitySpecs } = await supabase
        .from('client_qualities')
        .select('id')
        .eq('client_id', body.client_id)
        .eq('origin', body.origin)
        .limit(1)
        .single()

      if (qualitySpecs) {
        qualitySpecId = (qualitySpecs as any).id
      }
    }

    // Generate tracking number + insert with retry on duplicate key conflict
    // The generate_tracking_number() function uses MAX()+1 which can race under concurrent inserts
    const MAX_RETRIES = 3
    let sample: any = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data: trackingNumberData, error: trackingError } = await supabase
        .rpc('generate_tracking_number', {
          p_client_id: clientId,
          p_laboratory_id: body.laboratory_id,
          p_origin: body.origin,
          p_quality_template_id: qualitySpecId,
          p_is_rejected: false,
          p_sample_type: body.sample_type || 'pss'
        } as any)

      if (trackingError) {
        console.error('Error generating tracking number:', trackingError)
        return NextResponse.json({ error: 'Failed to generate tracking number' }, { status: 500 })
      }

      if (trackingNumberData === null || trackingNumberData === undefined) {
        console.error('Tracking number generation returned null for client:', clientId, 'origin:', body.origin)
        return NextResponse.json({
          error: 'Failed to generate tracking number - client configuration may be invalid',
          details: 'The tracking number format for this client is not properly configured. Please contact an administrator.'
        }, { status: 500 })
      }

      const trackingNumber = String(trackingNumberData)

      if (trackingNumber === 'null' || trackingNumber === '' || trackingNumber.startsWith('ERR-')) {
        console.error('Invalid tracking number generated:', trackingNumber, 'for client:', clientId)
        return NextResponse.json({
          error: 'Failed to generate valid tracking number',
          details: `Generated tracking number "${trackingNumber}" is invalid. Please check client configuration.`
        }, { status: 500 })
      }

      console.log(`Generated tracking number: ${trackingNumber} (attempt ${attempt})`)

      const sampleData: Record<string, any> = {
        tracking_number: trackingNumber,
        client_id: clientId,
        laboratory_id: body.laboratory_id,
        quality_spec_id: qualitySpecId,
        quality_name: body.quality_name || null,
        hide_exporter_on_label: body.hide_exporter_on_label || false,
        origin: body.origin,
        micro_origin: body.micro_origin || null,
        seller_id: body.seller_id || null,
        exporter_id: body.exporter_id || null,
        same_seller_shipper: body.same_seller_shipper ?? true,
        exporter_sample_number: body.exporter_sample_number || null,
        importer_id: body.importer_id || null,
        roaster_id: body.roaster_id || null,
        end_client_id: body.end_client_id || null,
        end_client_contract_nr: body.end_client_contract_nr || null,
        supplier: body.supplier || null,
        supplier_contract_nr: body.supplier_contract_nr || null,
        status: body.status || 'received',
        storage_position: body.storage_position || null,
        wolthers_contract_nr: body.wolthers_contract_nr || null,
        seller_contract_nr: body.seller_contract_nr || null,
        shipper_contract_nr: body.shipper_contract_nr || null,
        exporter_contract_nr: body.exporter_contract_nr || null,
        buyer_contract_nr: body.buyer_contract_nr || null,
        roaster_contract_nr: body.roaster_contract_nr || null,
        qc_client_contract_nr: body.qc_client_contract_nr || null,
        ico_number: body.ico_number || null,
        container_nr: body.container_nr || null,
        sample_type: body.sample_type || null,
        shipment_month: body.shipment_month || null,
        bags_quantity_mt: bagsQuantityMt,
        bag_count: bagCount,
        bag_weight_kg: body.bag_weight_kg ? parseFloat(body.bag_weight_kg) : null,
        equivalent_60kg_bags: body.equivalent_60kg_bags ? parseFloat(body.equivalent_60kg_bags) : null,
        bag_type: body.bag_type || null,
        processing_method: body.processing_method || null,
        workflow_stage: body.workflow_stage || 'received',
        assigned_to: body.assigned_to || null
      }

      const { data: insertedSample, error: insertError } = await (supabase as any)
        .from('samples')
        .insert(sampleData)
        .select()
        .single()

      if (!insertError) {
        sample = insertedSample
        break
      }

      // Check for duplicate key error - retry with new tracking number
      const isDuplicate = insertError.message?.includes('duplicate key') ||
        insertError.message?.includes('unique constraint') ||
        insertError.code === '23505'

      if (isDuplicate && attempt < MAX_RETRIES) {
        console.warn(`Duplicate tracking number ${trackingNumber}, retrying (attempt ${attempt + 1})...`)
        continue
      }

      console.error('Error creating sample:', insertError)
      return NextResponse.json({ error: 'Failed to create sample', details: insertError.message }, { status: 500 })
    }

    if (!sample) {
      return NextResponse.json({ error: 'Failed to create sample after retries' }, { status: 500 })
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
      sample.id,
      sample.tracking_number,
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
