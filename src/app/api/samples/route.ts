import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { Database } from '@/lib/database.types'
import { activities } from '@/lib/notifications'
import { sendAwbArrivalEmail } from '@/lib/email/awb-arrival'

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
    const sample_category = searchParams.get('sample_category')
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
        seller:companies!samples_seller_id_fkey(id, name, fantasy_name, country),
        exporter:companies!samples_exporter_id_fkey(id, name, fantasy_name, country),
        importer:companies!samples_importer_id_fkey(id, name, fantasy_name, country),
        roaster:companies!samples_roaster_id_fkey(id, name, fantasy_name, country),
        qc_client:companies!samples_client_id_fkey(id, name, fantasy_name, country, client_types:company_types),
        end_client:companies!samples_end_client_id_fkey(id, name, fantasy_name, country),
        certificate:certificates(id, certificate_number, status, created_at, sample_contract_id),
        sample_contracts(id, tracking_number, importer_id, roaster_id, end_client_id, client_id, importer_is_qc_client, buyer_contract_nr, wolthers_contract_nr, roaster_contract_nr, end_client_contract_nr, qc_client_contract_nr, supplier_contract_nr, ico_number, container_nr, bags_quantity_mt),
        sample_recipients(id, status)
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
    if (sample_category) query = query.eq('sample_category', sample_category)
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
    if (sample_category) countQuery = countQuery.eq('sample_category', sample_category)
    if (workflow_stage) countQuery = countQuery.eq('workflow_stage', workflow_stage)

    const { count } = await countQuery

    // Batch-fetch entity names for sub-contracts
    const allSubContracts = (samples || []).flatMap((s: any) =>
      Array.isArray(s.sample_contracts) ? s.sample_contracts : []
    )
    const importerIds = [...new Set(allSubContracts.map((c: any) => c.importer_id).filter(Boolean))] as string[]
    const roasterIds = [...new Set(allSubContracts.map((c: any) => c.roaster_id).filter(Boolean))] as string[]
    const clientIds = [...new Set([
      ...allSubContracts.map((c: any) => c.end_client_id),
      ...allSubContracts.map((c: any) => c.client_id),
    ].filter(Boolean))] as string[]

    const entityMaps = { importers: {} as Record<string, string>, roasters: {} as Record<string, string>, clients: {} as Record<string, string> }
    if (importerIds.length > 0) {
      const { data } = await (supabase as any).from('companies').select('id, name, fantasy_name').in('id', importerIds)
      for (const r of (data || []) as any[]) entityMaps.importers[r.id] = r.fantasy_name || r.name || ''
    }
    if (roasterIds.length > 0) {
      const { data } = await (supabase as any).from('companies').select('id, name, fantasy_name').in('id', roasterIds)
      for (const r of (data || []) as any[]) entityMaps.roasters[r.id] = r.fantasy_name || r.name || ''
    }
    if (clientIds.length > 0) {
      const { data } = await (supabase as any).from('companies').select('id, fantasy_name, name').in('id', clientIds)
      for (const r of (data || []) as any[]) entityMaps.clients[r.id] = r.fantasy_name || r.name || ''
    }

    // Transform samples to include flattened entity names
    const transformedSamples = (samples || []).map((sample: any) => {
      // Handle certificate array - Supabase returns array for one-to-many relations.
      // A sample with sub-contracts has MANY certificate rows (one mother +
      // one per sub-contract). The mother is the row with sample_contract_id
      // NULL — pick it explicitly. Taking [0] returned an arbitrary sub-contract
      // cert, so the tracker/preview title showed the wrong number.
      const allCerts: any[] = Array.isArray(sample.certificate)
        ? sample.certificate
        : sample.certificate
          ? [sample.certificate]
          : []
      const certificate =
        allCerts.find((c: any) => c.sample_contract_id === null) || allCerts[0] || null

      // Check QC client types for importer/roaster fallback (same logic as detail API)
      const clientTypes: string[] = sample.qc_client?.client_types || []
      const isImporterClient = clientTypes.some((t: string) => t.includes('importer'))
      const isRoasterClient = clientTypes.some((t: string) => t.includes('roaster'))
      const qcClientName = sample.qc_client?.fantasy_name || sample.qc_client?.company || null

      // Prefer fantasy_name for every party column so the tracker shows
      // "Coopervass" instead of "Cooperativa dos Cafeicultores da Zona de Três
      // Pontas Ltda" (which wraps across 3 lines). Fall back to legal name when
      // no fantasy is set.
      const sellerName = sample.seller?.fantasy_name || sample.seller?.name || null
      const exporterName = sample.exporter?.fantasy_name || sample.exporter?.name || null
      const importerLegalName = sample.importer?.fantasy_name || sample.importer?.name || null
      const roasterName = sample.roaster?.fantasy_name || sample.roaster?.name || null

      return {
        ...sample,
        // Prioritize sample's own quality_name (for type samples or custom entries),
        // fall back to quality_spec's custom_name
        quality_name: sample.quality_name || sample.quality_spec?.custom_name || null,
        quality_code: sample.quality_spec?.quality_code || null,
        // Seller (farm/producer) from seller_id
        seller_name: sellerName,
        seller_country: sample.seller?.country || null,
        // Exporter/Shipper from exporter_id
        exporter_name: exporterName,
        exporter_country: sample.exporter?.country || null,
        // Importer: from DB, or importer_is_qc_client flag, or QC client with importer type
        importer_name: importerLegalName || (sample.importer_is_qc_client ? qcClientName : null) || (isImporterClient ? qcClientName : null),
        importer_country: sample.importer?.country || (isImporterClient ? sample.qc_client?.country : null),
        // Roaster: from DB, or QC client with roaster type
        roaster_name: roasterName || (isRoasterClient ? qcClientName : null),
        roaster_country: sample.roaster?.country || (isRoasterClient ? sample.qc_client?.country : null),
        // QC Client (who hired Wolthers) from client_id
        qc_client_name: qcClientName,
        qc_client_country: sample.qc_client?.country || null,
        // End client (final buyer) - when NULL, QC client IS the end client
        end_client_name: sample.end_client?.fantasy_name || sample.end_client?.company || null,
        end_client_country: sample.end_client?.country || null,
        // Certificate info (flattened)
        certificate_id: certificate?.id || null,
        certificate_number: certificate?.certificate_number || null,
        certificate_status: certificate?.status || null,
        certificate_created_at: certificate?.created_at || null,
        // Sub-contract info (rich data for expandable rows)
        contract_count: Array.isArray(sample.sample_contracts) ? sample.sample_contracts.length : 0,
        sub_contract_tracking_numbers: Array.isArray(sample.sample_contracts)
          ? sample.sample_contracts.map((c: any) => c.tracking_number)
          : [],
        sub_contracts: Array.isArray(sample.sample_contracts)
          ? sample.sample_contracts.map((c: any) => {
              const subCert = allCerts.find((cert: any) => cert.sample_contract_id === c.id)
              const scQcName = c.client_id ? entityMaps.clients[c.client_id] : null
              return {
                id: c.id,
                tracking_number: c.tracking_number,
                importer_name: (c.importer_id ? entityMaps.importers[c.importer_id] : null) || (c.importer_is_qc_client ? (scQcName || qcClientName) : null),
                roaster_name: c.roaster_id ? entityMaps.roasters[c.roaster_id] : null,
                end_client_name: c.end_client_id ? entityMaps.clients[c.end_client_id] : null,
                qc_client_name: scQcName || qcClientName || null,
                buyer_contract_nr: c.buyer_contract_nr || null,
                wolthers_contract_nr: c.wolthers_contract_nr || null,
                roaster_contract_nr: c.roaster_contract_nr || null,
                end_client_contract_nr: c.end_client_contract_nr || null,
                qc_client_contract_nr: c.qc_client_contract_nr || null,
                supplier_contract_nr: c.supplier_contract_nr || null,
                ico_number: c.ico_number || null,
                container_nr: c.container_nr || null,
                bags_quantity_mt: c.bags_quantity_mt || null,
                has_certificate: !!subCert,
                certificate_id: subCert?.id || null,
                // Official minted cert number for THIS sub-contract (gap-free
                // numbering stores it on the certificate row, not on
                // sample_contracts.tracking_number). Needed so the preview title
                // shows the clicked child's number, not the mother's.
                certificate_number: subCert?.certificate_number || null,
              }
            })
          : [],
        // Remove nested objects to keep response clean
        quality_spec: undefined,
        seller: undefined,
        exporter: undefined,
        importer: undefined,
        roaster: undefined,
        qc_client: undefined,
        end_client: undefined,
        certificate: undefined,
        sample_contracts: undefined
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
    // The generate_tracking_number() RPC uses MAX()+1 which can race under concurrent inserts.
    // On retry, we increment the numeric part of the failed tracking number instead of
    // re-calling the RPC (which would return the same duplicate since no row was inserted).
    const MAX_RETRIES = 5
    let sample: any = null
    let lastTrackingNumber: string | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let trackingNumber: string

      // Split numbering: intake assigns an internal lab number (gaps allowed).
      // The official certificate number is minted gap-free at certification by
      // the certificates BEFORE INSERT trigger (when split_numbering=true).
      // Requires lab; for edge cases lacking a lab we fall back to the legacy
      // tracking generator.
      let trackingNumberData: any
      let trackingError: any
      if (body.laboratory_id) {
        // Internal lab number (gaps allowed). The official certificate number is
        // minted gap-free at certification by the certificates BEFORE INSERT trigger.
        ;({ data: trackingNumberData, error: trackingError } = await (supabase as any)
          .rpc('generate_sample_number', {
            p_laboratory_id: body.laboratory_id,
          }))
      } else {
        ;({ data: trackingNumberData, error: trackingError } = await supabase
          .rpc('generate_tracking_number', {
            p_client_id: clientId,
            p_laboratory_id: body.laboratory_id,
            p_origin: body.origin,
            p_quality_template_id: qualitySpecId,
            p_is_rejected: false,
            p_sample_type: body.sample_type || 'pss'
          } as any))
      }

      if (trackingError) {
        console.error('Error generating tracking/certificate number:', trackingError)
        return NextResponse.json({
          error: 'Failed to generate tracking number',
          details: trackingError.message
        }, { status: 500 })
      }

      if (trackingNumberData === null || trackingNumberData === undefined) {
        console.error('Number generation returned null for client:', clientId, 'lab:', body.laboratory_id)
        return NextResponse.json({
          error: 'Failed to generate tracking number - client/lab configuration may be invalid',
          details: 'The certificate pattern for this client is not properly configured. Please contact an administrator.'
        }, { status: 500 })
      }

      trackingNumber = String(trackingNumberData)

      if (trackingNumber === 'null' || trackingNumber === '' || trackingNumber.startsWith('ERR-')) {
        console.error('Invalid tracking number generated:', trackingNumber, 'for client:', clientId)
        return NextResponse.json({
          error: 'Failed to generate valid tracking number',
          details: `Generated tracking number "${trackingNumber}" is invalid. Please check client configuration.`
        }, { status: 500 })
      }

      lastTrackingNumber = trackingNumber
      console.log(`Generated tracking number: ${trackingNumber} (attempt ${attempt})`)

      const sampleData: Record<string, any> = {
        tracking_number: trackingNumber,
        split_numbering: Boolean(body.laboratory_id),
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
        importer_is_qc_client: body.importer_is_qc_client ?? true,
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
        certifications: Array.isArray(body.certifications) && body.certifications.length > 0
          ? body.certifications
          : null,
        sample_type: body.sample_type || null,
        shipment_month: body.shipment_month || null,
        bags_quantity_mt: bagsQuantityMt,
        bag_count: bagCount,
        bag_weight_kg: body.bag_weight_kg ? parseFloat(body.bag_weight_kg) : null,
        equivalent_60kg_bags: body.equivalent_60kg_bags ? parseFloat(body.equivalent_60kg_bags) : null,
        bag_type: body.bag_type || null,
        processing_method: body.processing_method || null,
        crop_year: body.crop_year || null,
        workflow_stage: body.workflow_stage || 'received',
        assigned_to: body.assigned_to || null,
        sample_category: body.sample_category || 'qc',
        awb_number: body.awb_number || null,
        courier_name: body.courier_name || null,
        is_quick_look: body.is_quick_look ?? false
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

      // If the duplicate is specifically about exporter_sample_number, give a clear message
      if (isDuplicate && insertError.message?.includes('exporter_sample')) {
        return NextResponse.json({
          error: 'A sample with this exporter sample number and container already exists. Please use a different sample number or container number.',
          details: insertError.message
        }, { status: 409 })
      }

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
      const { data: client } = await (supabase as any)
        .from('companies')
        .select('fantasy_name, name')
        .eq('id', clientId)
        .single()

      clientName = client?.fantasy_name || client?.name || 'Unknown Client'
    }

    // Log activity
    await activities.sampleRegistered(
      sample.id,
      sample.tracking_number,
      clientName,
      body.laboratory_id
    )

    // AWB buyer notification (Other Samples) — fire-and-forget; never block sample creation.
    if (sample.sample_category === 'other' && sample.awb_number && sample.end_client_id) {
      try {
        const { data: buyer } = await (supabase as any)
          .from('companies')
          .select('email, fantasy_name, name')
          .eq('id', sample.end_client_id)
          .single()

        if (buyer?.email) {
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

          await sendAwbArrivalEmail({
            trackingNumber: sample.tracking_number,
            awbNumber: sample.awb_number,
            courierName: sample.courier_name,
            buyerName: buyer.fantasy_name || buyer.name || 'Buyer',
            buyerEmail: buyer.email,
            sampleSubType: sample.sample_type,
            origin: sample.origin,
            qualityName: sample.quality_name,
            senderName: (senderProfile as any)?.full_name || null,
          })
        }
      } catch (notifyErr) {
        console.error('[Sample POST] AWB notification failed:', notifyErr)
      }
    }

    return NextResponse.json({ sample }, { status: 201 })
  } catch (error: any) {
    console.error('Error in POST /api/samples:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message || String(error)
    }, { status: 500 })
  }
}
