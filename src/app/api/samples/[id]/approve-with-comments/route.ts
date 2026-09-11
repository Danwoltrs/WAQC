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
import {
  applyDecision,
  mintCertificates,
  InvalidTrackingNumberError,
} from '@/lib/cupping/finalize-pipeline'

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
    // Worth a loud log — an orphaned audit row is untidy and someone should
    // clear it — but no longer dangerous. `samples.approved_with_comments` is
    // written LAST and only on the success path, and both readers check it
    // (isApprovedWithComments in lib/tolerance/fetch.ts), so a row belonging to
    // an approval that never took effect is inert: it cannot resurface its
    // abandoned issued values on a later ordinary approval of a re-graded lot.
    console.error(
      `[approve-with-comments] COMPENSATING DELETE FAILED for approval row ${approvalId} ` +
        `(sample ${sampleId}) — orphaned audit row, manual cleanup suggested`,
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

    // workflow_stage / tracking_number / client_id / sample_category are read
    // here because this route CERTIFIES the lot (see the long comment at the
    // decision step below), and the shared finalize pipeline needs all four.
    const { data: sample } = await db
      .from('samples')
      .select('id, quality_spec_id, workflow_stage, tracking_number, client_id, sample_category')
      .eq('id', labSourceId)
      .single()
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

    // From here on this is an ORDINARY APPROVAL that happens to carry a record,
    // exactly as the spec says — so it runs the same certification sequence as
    // every other approval path in this repo, not a bare status write.
    //
    // A status-only update was the original bug: `workflow_stage` stayed at
    // whatever grading left it at, and EVERY buyer surface gates on
    // `workflow_stage === 'certified' || 'rejected'` (the public QR page, the
    // public JSON endpoint, the buyer PDF, the portal). The whole buyer-facing
    // half of this feature was unreachable, and sys.wolthers.com never learned
    // the lot had been decided.
    //
    // `applyDecision` is the shared pipeline both cupping finalize routes use:
    // it WALKS the lot to 'review' one legal step at a time (the DB trigger
    // validate_workflow_stage_transition forbids analysis -> certified, so a
    // sample still at 'received'/'roasting'/'analysis' — the normal state when
    // grading is saved — is advanced received -> analysis -> review first),
    // applies status + stage to the WHOLE contract group, and pushes the
    // decision to the sys shipment_samples row. Then `mintCertificates` issues
    // one certificate per group member to that member's own client, with
    // issued_by / valid_from / valid_until / is_rejected / compliance_violations
    // set — and no violations, because the issued values passed the gate.
    //
    // Terminal stages the walk cannot leave ('rejected' -> 'certified' is not a
    // legal transition) make applyDecision throw; that is answered with an
    // explicit 409 naming the stage, never a silent 500. Re-approving a lot
    // already at 'certified' is a no-op stage change and is allowed through.
    //
    // The insert above and the writes below are NOT one transaction. The
    // correct fix is a single Postgres function called via rpc(), which would
    // be genuinely atomic — but that needs a second migration, and Daniel
    // applies migrations by hand, so adding one mid-flight would complicate an
    // already order-dependent deploy. A compensating delete is the considered
    // tradeoff instead.
    let groupIds: string[]
    try {
      groupIds = await groupSampleIds(db, labSourceId)
    } catch (groupError) {
      console.error('[approve-with-comments] groupSampleIds threw, rolling back decision', groupError)
      await rollbackDecision(db, inserted.id, labSourceId)
      return NextResponse.json({ error: 'Could not approve the sample' }, { status: 500 })
    }

    try {
      await applyDecision(db, {
        sampleId: labSourceId,
        decision: 'approved',
        currentWorkflowStage: (sample.workflow_stage as string | null) ?? null,
        actorUserId: user.id,
        // The tolerance comment lines live in the decision row and reach the
        // seller through the batch email's tolerance block. Passing null here
        // leaves any existing seller_comment untouched.
        sellerComment: null,
      })
    } catch (decisionError) {
      console.error('[approve-with-comments] certification failed, rolling back decision', decisionError)
      await rollbackDecision(db, inserted.id, labSourceId)
      return NextResponse.json(
        {
          error:
            `This sample could not be moved to certified from its current stage ` +
            `(${sample.workflow_stage ?? 'unknown'}). Move it back to review and try again.`,
        },
        { status: 409 },
      )
    }

    try {
      await mintCertificates(db, {
        sample: {
          id: labSourceId,
          client_id: (sample.client_id as string | null) ?? null,
          sample_category: (sample.sample_category as string | null) ?? null,
        },
        decision: 'approved',
        trackingNumber: (sample.tracking_number as string | null) ?? null,
        isRejected: false,
        // The issued values were proved against the same gate that judged the
        // raw ones (computeIssuedValuesForSample refuses otherwise), so the
        // buyer's certificate carries no violations.
        violations: [],
        actorUserId: user.id,
      })
    } catch (mintError) {
      // The group is already approved and certified at this point — that part
      // stands. Only the certificate rows are missing, and the decision row is
      // removed so nothing is half-applied. Reported honestly rather than as a
      // success.
      console.error('[approve-with-comments] certificate mint failed', mintError)
      await rollbackDecision(db, inserted.id, labSourceId)
      const status = mintError instanceof InvalidTrackingNumberError ? mintError.status : 500
      return NextResponse.json(
        {
          error: 'The sample was approved but its certificate could not be issued',
          details: mintError instanceof InvalidTrackingNumberError ? mintError.details : undefined,
        },
        { status },
      )
    }

    // LAST, and deliberately so. This flag is the live switch both tolerance
    // readers check (isApprovedWithComments in lib/tolerance/fetch.ts): until it
    // is set, the decision row is inert and every surface shows the measured
    // values. Setting it only once the lot is genuinely approved and certified
    // means a failure anywhere above leaves a complete, consistent ORDINARY
    // approval rather than a lot whose buyer certificate quietly prints issued
    // numbers for a decision that never landed.
    const { error: flagError } = await db
      .from('samples')
      .update({ approved_with_comments: true })
      .in('id', groupIds)
    if (flagError) {
      console.error('[approve-with-comments] flag update', flagError)
      await rollbackDecision(db, inserted.id, labSourceId)
      return NextResponse.json(
        { error: 'The sample was approved but the tolerance comments were not recorded' },
        { status: 500 },
      )
    }

    return NextResponse.json({ data: { approved: groupIds.length, issued: issuedResult.issued } })
  } catch (error) {
    console.error('[approve-with-comments] unhandled', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
