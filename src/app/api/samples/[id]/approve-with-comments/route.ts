import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { isStaffSampleManager } from '@/lib/auth/sample-access'
import { evaluateSampleCompliance } from '@/lib/compliance'
import { evaluateTolerance } from '@/lib/tolerance/evaluate'
import type { IssuedValues } from '@/lib/tolerance/issued-values'
import { groupSampleIds, resolveLabSourceId } from '@/lib/sample-group'
import type { ToleranceItem } from '@/lib/tolerance/types'
import { computeIssuedValuesForSample } from '@/lib/tolerance/sample-limits'

export interface DecisionRow {
  metrics: ToleranceItem[]
  issued_values: IssuedValues
  comments: string[]
  request_additional_sample: boolean
  decided_by: string
}

/** Pure: shape the audit row. Exported so it can be tested without a database. */
export function buildDecision(args: {
  items: ToleranceItem[]
  issued: IssuedValues
  comments: string[]
  requestAdditionalSample: boolean
  userId: string
}): DecisionRow {
  return {
    metrics: args.items,
    issued_values: args.issued,
    comments: args.comments.map((c) => c.trim()).filter(Boolean),
    request_additional_sample: args.requestAdditionalSample,
    decided_by: args.userId,
  }
}

const admin = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

/**
 * Deletes the just-inserted decision row after a later step in the same
 * request failed. See the long comment at the call site for why this is a
 * compensating delete rather than one transaction.
 */
async function rollbackDecision(
  db: ReturnType<typeof admin>,
  approvalId: string,
  sampleId: string,
): Promise<void> {
  const { error } = await db.from('sample_tolerance_approvals').delete().eq('id', approvalId)
  if (error) {
    // This is the one case a human needs to clean up by hand: the audit row
    // is orphaned (no sample was actually approved), and a later ordinary
    // approval of this lot would silently pick it up via
    // fetchIssuedValues/fetchToleranceApproval, which key only on a row
    // existing for this lab-source sample.
    console.error(
      `[approve-with-comments] COMPENSATING DELETE FAILED for approval row ${approvalId} ` +
        `(sample ${sampleId}) — manual cleanup required`,
      error,
    )
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await req.json().catch(() => ({}))
    // Only the shape is trusted, never the content: a malformed element (a
    // number, an object) must not crash the route before it ever reaches the
    // recomputation this route exists to enforce.
    const comments: string[] = Array.isArray(body?.comments)
      ? body.comments.filter((c: unknown): c is string => typeof c === 'string')
      : []
    const requestAdditionalSample = body?.request_additional_sample !== false

    const db = admin()
    const labSourceId = await resolveLabSourceId(db, id)

    const { data: sample } = await db
      .from('samples').select('id, quality_spec_id').eq('id', labSourceId).single()
    if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })

    // Recompute server-side. Client-supplied issued values are never trusted.
    const criteria = await evaluateSampleCompliance(db as any, labSourceId, sample.quality_spec_id)
    const assessment = evaluateTolerance(criteria)
    if (!assessment.offered) {
      return NextResponse.json(
        { error: 'This sample is not within tolerance', blockedBy: assessment.blockedBy },
        { status: 409 },
      )
    }

    const issuedResult = await computeIssuedValuesForSample(db, labSourceId, sample.quality_spec_id)
    if (!issuedResult.ok) {
      return NextResponse.json({ error: issuedResult.reason }, { status: 409 })
    }

    const decision = buildDecision({
      items: assessment.items,
      issued: issuedResult.issued,
      comments,
      requestAdditionalSample,
      userId: user.id,
    })

    const { data: inserted, error: insertError } = await db
      .from('sample_tolerance_approvals')
      .insert({ sample_id: labSourceId, ...decision })
      .select('id')
      .single()
    if (insertError || !inserted) {
      console.error('[approve-with-comments] insert', insertError)
      return NextResponse.json({ error: 'Could not record the decision' }, { status: 500 })
    }

    // The insert above and the group update below are NOT one transaction.
    // The correct fix is a single Postgres function called via rpc(), which
    // would be genuinely atomic — but that needs a second migration, and
    // Daniel applies migrations by hand, so adding one mid-flight would
    // complicate an already order-dependent deploy. A compensating delete is
    // the considered tradeoff instead: if the group can't be resolved or the
    // samples update fails, the decision row is deleted rather than left
    // behind. Leaving it behind is not merely untidy — fetchIssuedValues and
    // fetchToleranceApproval key ONLY on a row existing for this lab-source
    // sample (neither checks samples.approved_with_comments), so an orphaned
    // row would silently resurface these abandoned issued values on a LATER,
    // ordinary approval of a re-graded lot, hiding the genuine measurements
    // behind a decision that never actually took effect.
    let groupIds: string[]
    try {
      groupIds = await groupSampleIds(db, labSourceId)
    } catch (groupError) {
      console.error('[approve-with-comments] groupSampleIds threw, rolling back decision', groupError)
      await rollbackDecision(db, inserted.id, labSourceId)
      return NextResponse.json({ error: 'Could not approve the sample' }, { status: 500 })
    }

    const { error: updateError } = await db
      .from('samples')
      .update({ status: 'approved', approved_with_comments: true })
      .in('id', groupIds)
    if (updateError) {
      console.error('[approve-with-comments] update', updateError)
      await rollbackDecision(db, inserted.id, labSourceId)
      return NextResponse.json({ error: 'Could not approve the sample' }, { status: 500 })
    }

    return NextResponse.json({ data: { approved: groupIds.length, issued: issuedResult.issued } })
  } catch (error) {
    console.error('[approve-with-comments] unhandled', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
