import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const MAX_DUPLICATE_COUNT = 20

/**
 * POST /api/samples/[id]/duplicate
 * Duplicate an SS sample — creates a new independent sample record sharing the same contract info.
 * This is the SS equivalent of PSS sub-contracts.
 *
 * Body: { count?: number } — number of duplicates to create (1–20, default 1).
 * Response: { samples: Sample[], failed: number, errors?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    // Parse and validate count from body (default 1; out-of-range rejected)
    let count = 1
    try {
      const body = await request.json()
      if (body && typeof body.count === 'number' && Number.isFinite(body.count)) {
        count = Math.floor(body.count)
      }
    } catch {
      // No body or invalid JSON — default count stays at 1
    }
    if (count < 1 || count > MAX_DUPLICATE_COUNT) {
      return NextResponse.json(
        { error: `count must be an integer between 1 and ${MAX_DUPLICATE_COUNT}` },
        { status: 400 }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the source sample
    const { data: source, error: sourceError } = await supabase
      .from('samples')
      .select('*')
      .eq('id', sampleId)
      .is('deleted_at', null)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    const createdSamples: any[] = []
    const errors: string[] = []
    // Track the most recent tracking number across iterations so the next
    // duplicate's first attempt skips a number we just used (avoids unnecessary
    // 23505 round-trips when count > 1).
    let lastTrackingNumber: string | null = null

    for (let i = 0; i < count; i++) {
      const created = await insertOneDuplicate(supabase, source, lastTrackingNumber)
      if (created.sample) {
        createdSamples.push(created.sample)
        lastTrackingNumber = created.sample.tracking_number
      } else if (created.error) {
        errors.push(created.error)
      }
    }

    if (createdSamples.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create any duplicates', errors },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        samples: createdSamples,
        failed: count - createdSamples.length,
        ...(errors.length > 0 ? { errors } : {}),
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error in POST /api/samples/[id]/duplicate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Insert one duplicate sample with tracking-number-collision retry.
 * Returns either { sample } on success or { error } on terminal failure.
 *
 * @param seedTrackingNumber Optional hint for the first attempt; if provided,
 *   the next tracking number is derived by incrementing this one instead of
 *   re-calling generate_tracking_number. Used when looping multiple duplicates
 *   in one request so each iteration starts past the previous result.
 */
async function insertOneDuplicate(
  supabase: any,
  source: any,
  seedTrackingNumber: string | null
): Promise<{ sample?: any; error?: string }> {
  const MAX_RETRIES = 5
  let lastTrackingNumber: string | null = seedTrackingNumber

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let trackingNumber: string

    if (attempt === 1 && !lastTrackingNumber) {
      const { data: trackingNumberData, error: trackingError } = await supabase
        .rpc('generate_tracking_number', {
          p_client_id: source.client_id,
          p_laboratory_id: source.laboratory_id,
          p_origin: source.origin,
          p_quality_template_id: source.quality_spec_id,
          p_is_rejected: false,
          p_sample_type: source.sample_type || 'ss'
        } as any)

      if (trackingError || !trackingNumberData) {
        console.error('Error generating tracking number for duplicate:', trackingError)
        return { error: 'Failed to generate tracking number' }
      }
      trackingNumber = String(trackingNumberData)
    } else if (lastTrackingNumber) {
      // Retry (or subsequent iteration in a multi-duplicate call):
      // increment the numeric part of the most recent tracking number.
      const slashIdx = lastTrackingNumber.lastIndexOf('/')
      const left = slashIdx >= 0 ? lastTrackingNumber.substring(0, slashIdx) : lastTrackingNumber
      const suffix = slashIdx >= 0 ? lastTrackingNumber.substring(slashIdx) : ''
      const match = left.match(/^(.*?)(\d+)$/)
      if (match) {
        const prefix = match[1]
        const numStr = match[2]
        const nextNum = (parseInt(numStr) + 1).toString().padStart(numStr.length, '0')
        trackingNumber = prefix + nextNum + suffix
      } else {
        const { data: rpcData } = await supabase.rpc('generate_tracking_number', {
          p_client_id: source.client_id,
          p_laboratory_id: source.laboratory_id,
          p_origin: source.origin,
          p_quality_template_id: source.quality_spec_id,
          p_is_rejected: false,
          p_sample_type: source.sample_type || 'ss'
        } as any)
        trackingNumber = String(rpcData)
      }
    } else {
      // Shouldn't happen, but guard against undefined state
      return { error: 'Tracking number generation failed' }
    }

    lastTrackingNumber = trackingNumber
    console.log(`Duplicate: generated tracking number ${trackingNumber} (attempt ${attempt})`)

    // Fields to copy from the source sample
    const duplicateData: Record<string, any> = {
      tracking_number: trackingNumber,
      client_id: source.client_id,
      laboratory_id: source.laboratory_id,
      origin: source.origin,
      micro_origin: source.micro_origin,
      seller_id: source.seller_id,
      exporter_id: source.exporter_id,
      same_seller_shipper: source.same_seller_shipper,
      importer_is_qc_client: source.importer_is_qc_client,
      exporter_sample_number: source.exporter_sample_number,
      importer_id: source.importer_id,
      roaster_id: source.roaster_id,
      end_client_id: source.end_client_id,
      end_client_contract_nr: source.end_client_contract_nr,
      supplier: source.supplier,
      supplier_contract_nr: source.supplier_contract_nr,
      processing_method: source.processing_method,
      sample_type: source.sample_type,
      quality_spec_id: source.quality_spec_id,
      quality_name: source.quality_name,
      hide_exporter_on_label: source.hide_exporter_on_label,
      crop_year: (source as any).crop_year,
      wolthers_contract_nr: source.wolthers_contract_nr,
      seller_contract_nr: source.seller_contract_nr,
      shipper_contract_nr: source.shipper_contract_nr,
      exporter_contract_nr: source.exporter_contract_nr,
      buyer_contract_nr: source.buyer_contract_nr,
      roaster_contract_nr: source.roaster_contract_nr,
      qc_client_contract_nr: source.qc_client_contract_nr,
      ico_number: source.ico_number,
      container_nr: source.container_nr,
      bags_quantity_mt: source.bags_quantity_mt,
      bag_count: source.bag_count,
      bag_weight_kg: source.bag_weight_kg,
      bag_type: source.bag_type,
      equivalent_60kg_bags: source.equivalent_60kg_bags,
      shipment_month: source.shipment_month,
      status: 'received',
      workflow_stage: 'received',
    }

    const { data: insertedSample, error: insertError } = await (supabase as any)
      .from('samples')
      .insert(duplicateData)
      .select()
      .single()

    if (insertError) {
      // PostgreSQL 23505 = unique_violation — retry with incremented tracking number
      if (insertError.code === '23505' && attempt < MAX_RETRIES) {
        console.warn(`Duplicate key on attempt ${attempt}, retrying...`)
        continue
      }
      console.error('Error creating duplicate sample:', insertError)
      return { error: insertError.message || 'Failed to create duplicate sample' }
    }

    return { sample: insertedSample }
  }

  return { error: 'Failed to create duplicate after retry attempts exhausted' }
}
