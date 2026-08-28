import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { santosDayRangeUtc } from '@/lib/tin-label-batch'
import { resolveLabSourceIds } from '@/lib/sample-group'

const PRINTABLE_STAGES = ['certified', 'rejected']

/**
 * GET /api/samples/tin-labels/pending-today
 *
 * Samples certified today (Santos time) whose tin label has not been printed.
 * Drives both the button's badge and the batch it prints, so the two can never
 * disagree.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { startUtc, endUtc } = santosDayRangeUtc(new Date())

    // Certificates issued today. A contract sibling's certificate counts for
    // its lot: the tin is one per physical sample, so every id below is
    // resolved to its lab unit before the printed/unprinted check.
    const { data: certRows, error: certError } = await supabase
      .from('certificates')
      .select('sample_id')
      .not('certificate_number', 'is', null)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())

    if (certError) {
      console.error('Error fetching today\'s certificates:', certError)
      return NextResponse.json({
        error: 'Failed to fetch certificates',
        details: certError.message || String(certError),
      }, { status: 500 })
    }

    const certifiedIds = Array.from(new Set((certRows || []).map(r => r.sample_id).filter(Boolean))) as string[]
    if (certifiedIds.length === 0) {
      return NextResponse.json({ sample_ids: [], count: 0 })
    }
    const candidateIds = Array.from(new Set((await resolveLabSourceIds(supabase, certifiedIds)).values()))

    // tin_label_printed_at is not yet in the generated Supabase types, so the
    // filter is applied through an untyped client. Drop the cast once the types
    // are regenerated.
    const { data: samples, error: sampleError } = await (supabase as any)
      .from('samples')
      .select('id')
      .in('id', candidateIds)
      .in('workflow_stage', PRINTABLE_STAGES)
      .is('tin_label_printed_at', null)
      .is('deleted_at', null)

    if (sampleError) {
      console.error('Error fetching unprinted samples:', sampleError)
      return NextResponse.json({
        error: 'Failed to fetch samples',
        details: sampleError.message || String(sampleError),
      }, { status: 500 })
    }

    const sampleIds = ((samples || []) as Array<{ id: string }>).map(s => s.id)
    return NextResponse.json({ sample_ids: sampleIds, count: sampleIds.length })
  } catch (error) {
    console.error('Error in GET /api/samples/tin-labels/pending-today:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
