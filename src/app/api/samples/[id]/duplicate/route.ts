import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import {
  buildDuplicateRow,
  duplicateQuantityError,
  type DuplicateQuantityOverride,
} from '@/lib/sample-duplicate'

const MAX_DUPLICATE_COUNT = 20

/**
 * POST /api/samples/[id]/duplicate
 * Duplicate an SS sample for the next container of the same contract: the copy
 * takes everything but the container number (see src/lib/sample-duplicate.ts).
 *
 * Body: { count?: number, bag_count?: number, container_count?: number, bags_quantity_mt?: number }
 *   — count = duplicates to create (1–20, default 1); the rest optionally
 *   replaces the copies' quantity (bags: bag_count; bulk: bag_count as 60 kg
 *   equivalents, at most 360, or container_count + bags_quantity_mt).
 *   Without it the copies keep the source's quantity.
 * Response: { samples: Sample[], failed: number, errors?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sampleId } = await params
    const supabase = await createClient()

    // Parse count + optional quantity from body. The duplicate popover lets
    // the user type another quantity for the copies (bags, or 60 kg
    // equivalents for bulk); without one the copies keep the source's.
    let count = 1
    const bagOverride: DuplicateQuantityOverride = { bagCount: null, containerCount: null, bagsMt: null }
    try {
      const body = await request.json()
      if (body && typeof body.count === 'number' && Number.isFinite(body.count)) {
        count = Math.floor(body.count)
      }
      if (body && typeof body.bag_count === 'number' && Number.isFinite(body.bag_count) && body.bag_count > 0) {
        bagOverride.bagCount = Math.floor(body.bag_count)
      }
      if (body && typeof body.container_count === 'number' && Number.isFinite(body.container_count) && body.container_count > 0) {
        bagOverride.containerCount = Math.floor(body.container_count)
      }
      if (body && typeof body.bags_quantity_mt === 'number' && Number.isFinite(body.bags_quantity_mt) && body.bags_quantity_mt > 0) {
        bagOverride.bagsMt = body.bags_quantity_mt
      }
    } catch {
      // No body or invalid JSON — default count stays at 1, no override
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

    const quantityError = duplicateQuantityError(source, bagOverride)
    if (quantityError) {
      return NextResponse.json({ error: quantityError }, { status: 400 })
    }

    const createdSamples: any[] = []
    const errors: string[] = []
    // Track the most recent tracking number across iterations so the next
    // duplicate's first attempt skips a number we just used (avoids unnecessary
    // 23505 round-trips when count > 1).
    let lastTrackingNumber: string | null = null

    for (let i = 0; i < count; i++) {
      const created = await insertOneDuplicate(supabase, source, lastTrackingNumber, bagOverride, user.id)
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
  seedTrackingNumber: string | null,
  bagOverride: DuplicateQuantityOverride,
  createdBy: string,
): Promise<{ sample?: any; error?: string }> {
  const MAX_RETRIES = 5
  let lastTrackingNumber: string | null = seedTrackingNumber

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let trackingNumber: string

    // Internal lab numbering: each duplicate draws the next internal sample
    // number from the per-lab sequence (atomic — every call, including retries
    // and multi-duplicate loops, yields a fresh unique number). The cert number
    // is assigned only at approval time (split_numbering=true path). Falls back
    // to the legacy generator for edge cases lacking a lab id.
    let trackingNumberData: any
    let trackingError: any
    if (source.laboratory_id) {
      ;({ data: trackingNumberData, error: trackingError } = await (supabase as any)
        .rpc('generate_sample_number', {
          p_laboratory_id: source.laboratory_id,
        }))
    } else {
      ({ data: trackingNumberData, error: trackingError } = await supabase
        .rpc('generate_tracking_number', {
          p_client_id: source.client_id,
          p_laboratory_id: source.laboratory_id,
          p_origin: source.origin,
          p_quality_template_id: source.quality_spec_id,
          p_is_rejected: false,
          p_sample_type: source.sample_type || 'ss'
        } as any))
    }

    if (trackingError || !trackingNumberData) {
      console.error('Error generating tracking number for duplicate:', trackingError)
      return { error: 'Failed to generate tracking number' }
    }
    trackingNumber = String(trackingNumberData)

    lastTrackingNumber = trackingNumber
    console.log(`Duplicate: generated tracking number ${trackingNumber} (attempt ${attempt})`)

    // A copy is the same lot and contract in its next container: everything
    // but the container number is copied (buildDuplicateRow), and a quantity
    // typed in the popover replaces the source's on every copy. It starts as
    // its own lab unit in the queue, with a fresh internal number.
    const duplicateData: Record<string, any> = {
      ...buildDuplicateRow(source, bagOverride),
      tracking_number: trackingNumber,
      created_by: createdBy,
      split_numbering: Boolean(source.laboratory_id),
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
