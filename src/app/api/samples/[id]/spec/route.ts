import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveSampleSpec, specVersionStatus } from '@/lib/quality-spec/resolve'

/**
 * GET /api/samples/[id]/spec
 *
 * The client quality a sample row is judged by, at the version the lot was
 * graded under (its pin), else the one its contract date picks:
 * `{ client_quality, version: { pinned, implied, mismatch } }`. `client_quality`
 * has the shape /api/client-qualities/[id] returns, so the certificate editor
 * parses it the same way. `version` carries the version numbers only.
 *
 * Gated like /api/client-qualities/[id]: a signed-in user who can read the
 * sample and its client quality under RLS. The spec itself is then resolved
 * with the service role (version rows and sys contract dates).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const { data: sample, error: sampleError } = await (supabase as any)
      .from('samples')
      .select('id, quality_spec_id')
      .eq('id', id)
      .maybeSingle()
    if (sampleError) {
      console.error('Error fetching sample for spec:', sampleError)
      return NextResponse.json({ error: 'Failed to fetch sample' }, { status: 500 })
    }
    if (!sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    if (!sample.quality_spec_id) {
      return NextResponse.json({ client_quality: null, version: { pinned: null, implied: null, mismatch: false } })
    }

    const { data: quality, error: qualityError } = await supabase
      .from('client_qualities')
      .select('id')
      .eq('id', sample.quality_spec_id)
      .maybeSingle()
    if (qualityError) {
      console.error('Error fetching client quality for spec:', qualityError)
      return NextResponse.json({ error: 'Failed to fetch client quality' }, { status: 500 })
    }
    if (!quality) {
      return NextResponse.json({ error: 'Client quality not found' }, { status: 404 })
    }

    const [clientQuality, status] = await Promise.all([resolveSampleSpec(id), specVersionStatus(id)])

    return NextResponse.json({
      client_quality: clientQuality,
      version: {
        pinned: status.pinned?.version_no ?? null,
        implied: status.implied?.version_no ?? null,
        mismatch: status.mismatch,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/spec:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
