import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { evaluateSampleCompliance } from '@/lib/compliance'
import { evaluateTolerance } from '@/lib/tolerance/evaluate'
import { resolveLabSourceId } from '@/lib/sample-group'
import { computeIssuedValuesForSample } from '@/lib/tolerance/sample-limits'

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * GET /api/samples/[id]/tolerance
 *
 * The grading page cannot compute a tolerance assessment itself — it holds
 * only its own ad-hoc {errors, violatedScreens} shape, never
 * ComplianceCriterion[]. Deriving criteria client-side would duplicate the
 * approval gate, which is the one thing this design exists to avoid. This is
 * the read-only companion to `POST /api/samples/[id]/approve-with-comments`:
 * it reuses the same `computeIssuedValuesForSample` helper so the preview and
 * the actual decision can never derive different limits or issued values for
 * the same lot. It is advisory only — the POST recomputes everything again
 * independently, so a stale or manipulated GET response can never widen what
 * is actually approvable.
 *
 * Kept as its own route (not folded into the POST's file) because a GET on an
 * action-verb path like /approve-with-comments reads wrong — "fetch the act
 * of approving" — and because /api/samples/[id]/tolerance is the path this
 * design has always described as the grading page's read companion.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Service-role bypasses RLS, so getUser() alone would be an IDOR: a /portal
    // client shares the same Supabase auth.
    if (!(await isStaffSampleManager(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = admin()
    const labSourceId = await resolveLabSourceId(db, id)
    const { data: sample } = await db
      .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
    if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

    const criteria = await evaluateSampleCompliance(db as any, labSourceId, sample.quality_spec_id)
    const assessment = evaluateTolerance(criteria)
    // Only compute the preview when the banner would actually be offered.
    const issued = assessment.offered
      ? await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
      : null

    return NextResponse.json({
      data: {
        assessment,
        issued: issued?.ok ? issued.issued : null,
        // When the values cannot be issued the banner must not be offered at all.
        blocked: issued && !issued.ok ? issued.reason : null,
      },
    })
  } catch (error) {
    console.error('[tolerance] unhandled', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
