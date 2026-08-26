import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { evaluateQualityCompliance, type QualityComplianceResult } from '@/lib/compliance'
import { CVA_PROTOCOL, CVA_SESSION_TYPE } from '@/lib/cupping-protocol-scope'
import { assertCanFinalize } from '@/lib/cupping/finalize-gate'
import {
  applyDecision,
  mintCertificates,
  closeSessionIfComplete,
  InvalidTrackingNumberError,
  type MintedCertificate,
} from '@/lib/cupping/finalize-pipeline'
import {
  decideCvaVerdict,
  decideCvaOutcome,
  overrideError,
  buildCvaAssessmentFields,
  pickAuthoritativeCvaRow,
  type CvaOverride,
} from '@/lib/cupping/cva-verdict'
import { parseCvaNumber } from '@/lib/cupping/cva-cupping-data'
import type { CvaAssessment } from '@/types/cva'

// Service-role client (bypasses RLS), same as the commodity finalize route.
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * POST /api/cupping/cva/finalize
 *
 * The specialty (SCA CVA 2024) sibling of POST /api/cupping/finalize. Same
 * spine — the stage machine, the sys write-back, the certificate mint and the
 * session close all come from finalize-pipeline.ts — but a different decision:
 * a commodity lot is judged attribute by attribute, a specialty lot on one
 * 0-100 score against the quality's cva_min_score.
 *
 * Certification is a TWO-PART gate, exactly as it is for commodity: the cup and
 * the green bean must both pass. An override speaks to the cup only.
 *
 * Body: {
 *   session_id: string,
 *   sample_id: string,
 *   override?: { decision: 'approved' | 'rejected', comment: string },
 *   seller_comment?: string,
 *   notes?: string,
 *   validated_by_cupper_id?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { session_id, sample_id, notes, validated_by_cupper_id } = body
    // Optional seller-only approval note; persisted + pushed to sys only on approval.
    const sellerComment: string | null =
      typeof body.seller_comment === 'string' && body.seller_comment.trim()
        ? body.seller_comment.trim()
        : null

    if (!session_id || !sample_id) {
      return NextResponse.json({
        error: 'session_id and sample_id are required'
      }, { status: 400 })
    }

    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('cupping_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // The two protocols share cupping_sessions, so this route must refuse a
    // commodity session outright: finalizing one here would judge it against a
    // CVA pass mark it was never cupped for.
    if ((session as any).session_type !== CVA_SESSION_TYPE) {
      return NextResponse.json({ error: 'Not a CVA session' }, { status: 400 })
    }

    // The CVA score rows for this sample in this session, newest first. One
    // query serves both the verdict (the authoritative row's score and
    // assessment) and the cupper count the gate needs. Scoped to this session on
    // purpose: a CVA row written in some other session is not a second opinion
    // in this one.
    const { data: cvaScoreRows } = await supabaseAdmin
      .from('cupping_scores')
      .select('cupper_id, cva_score, scores, updated_at')
      .eq('session_id', session_id)
      .eq('sample_id', sample_id)
      .eq('protocol', CVA_PROTOCOL)
      .order('updated_at', { ascending: false })

    const scoreRows = (cvaScoreRows ?? []) as any[]
    // The master cupper's reading is what the certificate asserts, same as on
    // the commodity side; newest-wins is only the fallback. Without this, a
    // colleague opening the lot and autosaving an empty assessment would
    // outrank a complete, passing one.
    const authoritativeRow = pickAuthoritativeCvaRow(
      scoreRows,
      ((session as any).master_cupper_id as string | null) ?? null,
    )
    // An unparseable score reads as "not recorded" rather than as a number:
    // NaN would compare false against any mark and silently fail the cup.
    // `parseCvaNumber` is the one parser for this column — the certificate
    // reads the persisted value through it too, so a value this route judged
    // and a value the certificate prints can never disagree about what counts
    // as "recorded" (notably `Number('') === 0`, a printable zero).
    const cvaScore: number | null = parseCvaNumber(authoritativeRow?.cva_score)
    const assessment: CvaAssessment | null =
      authoritativeRow?.scores && typeof authoritativeRow.scores === 'object'
        ? (authoritativeRow.scores as CvaAssessment)
        : null

    const gate = assertCanFinalize({
      session: session as any,
      sampleId: sample_id,
      actor: profile as any,
      completedCupperIds: scoreRows.map((r) => r.cupper_id).filter(Boolean),
    })
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
    const { assignedCupperIds } = gate

    const overrideMessage = overrideError(body.override)
    if (overrideMessage) {
      return NextResponse.json({ error: overrideMessage }, { status: 400 })
    }
    const override: CvaOverride | null = (body.override as CvaOverride) ?? null

    // Exclude soft-deleted samples, same as the commodity route.
    const { data: sample, error: sampleError } = await supabaseAdmin
      .from('samples')
      .select('id, tracking_number, client_id, workflow_stage, quality_spec_id, sample_category')
      .eq('id', sample_id)
      .is('deleted_at', null)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // The pass mark lives on the template behind the sample's quality spec.
    // Null here (no spec, no template, or no mark configured) makes the cup
    // unjudgeable — decideCvaVerdict says so, and decideCvaOutcome blocks.
    let cvaMinScore: number | null = null
    if (sample.quality_spec_id) {
      const { data: specData } = await supabaseAdmin
        .from('client_qualities')
        .select('template:quality_templates(cva_min_score)')
        .eq('id', sample.quality_spec_id)
        .single()
      cvaMinScore = parseCvaNumber((specData as any)?.template?.cva_min_score)
    }

    const verdict = decideCvaVerdict({ cvaScore, cvaMinScore, override })

    // The green-bean half is unchanged and commodity-shaped: a specialty lot
    // has no commodity attribute rows so its cupping criteria never emit, while
    // defects, screen sizes, moisture and quakers still apply. Only evaluated
    // once grading data exists — running it against an ungraded lot could emit
    // violations that would turn an awaiting-grading lot into a rejection.
    // clean_cup / uniform_cup come back so buildCvaAssessmentFields can apply
    // the commodity route's preserve-a-human-correction guard: a flag a lab
    // user already set in the cert editor is never rewritten from the CVA
    // reading on a later pass.
    const { data: gradingRow } = await supabaseAdmin
      .from('quality_assessments')
      .select('id, green_bean_data, clean_cup, uniform_cup')
      .eq('sample_id', sample_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const hasGradingData = Boolean((gradingRow as any)?.green_bean_data)

    let complianceResult: QualityComplianceResult = { approved: true, violations: [] }
    if (hasGradingData) {
      complianceResult = await evaluateQualityCompliance(
        supabaseAdmin,
        sample_id,
        sample.quality_spec_id,
        assignedCupperIds
      )
    }

    // The whole decision, in one tested pure function. Certifies only on
    // cupPassed === true + green bean passed + grading present; an unjudgeable
    // cup (cupPassed === null) can never reach 'approved'.
    const outcome = decideCvaOutcome({
      verdict,
      complianceViolations: complianceResult.violations,
      hasGradingData,
    })
    const decision = outcome.decision

    // Persist what this lot was judged as and judged against, BEFORE anything
    // irreversible happens. The certificate reads these columns rather than
    // recomputing, so a certified lot whose verdict never landed would assert a
    // cup quality with nothing behind it — that failure aborts the finalize
    // with the sample untouched, instead of certifying on a silent miss.
    // WHICH columns get written is decided by buildCvaAssessmentFields, and
    // every one of them is conditional — a finalize with nothing new to say
    // about the cup (a lot re-opened in a later session and never re-scored)
    // must leave an already-certified verdict exactly as it stands, and a cup
    // flag a human corrected in the cert editor must survive the second
    // Certify pass. See that function for the two failures this prevents.
    const cvaFields = buildCvaAssessmentFields({
      cvaScore,
      cvaMinScore,
      verdict,
      override,
      assessment,
      existingCleanCup: (gradingRow as any)?.clean_cup ?? null,
      existingUniformCup: (gradingRow as any)?.uniform_cup ?? null,
      overrideBy: profile.id,
      overrideAt: new Date().toISOString(),
    })

    const { error: qaWriteError } = gradingRow
      ? await supabaseAdmin
          .from('quality_assessments')
          .update({ ...cvaFields, updated_at: new Date().toISOString() } as any)
          .eq('id', (gradingRow as any).id)
      : await supabaseAdmin
          .from('quality_assessments')
          .insert({ sample_id, ...cvaFields } as any)

    if (qaWriteError) {
      console.error('[cva-finalize] quality_assessments write failed for sample', sample_id, qaWriteError)
      return NextResponse.json({
        error: 'Failed to record the CVA verdict - nothing was certified',
        details: qaWriteError.message,
      }, { status: 500 })
    }

    // From here the pipeline is protocol-agnostic and shared with the commodity
    // route. `decision === 'pending'` stops after the review transition and
    // mints nothing.
    await applyDecision(supabaseAdmin, {
      sampleId: sample_id,
      decision,
      currentWorkflowStage: sample.workflow_stage,
      actorUserId: user.id,
      sellerComment,
    })

    let certificate: MintedCertificate | null = null
    try {
      const minted = await mintCertificates(supabaseAdmin, {
        sample: {
          id: sample_id,
          client_id: sample.client_id,
          sample_category: (sample as any).sample_category ?? null,
        },
        decision,
        trackingNumber: sample.tracking_number,
        isRejected: decision === 'rejected',
        violations: outcome.violations,
        actorUserId: user.id,
      })
      certificate = minted.certificate
    } catch (mintError) {
      // A broken tracking number stays a 400 with actionable detail, exactly as
      // the commodity route returns it — not the outer catch's generic 500. The
      // sample has already been moved by applyDecision at this point, same as
      // there.
      if (mintError instanceof InvalidTrackingNumberError) {
        return NextResponse.json({
          error: mintError.message,
          details: mintError.details
        }, { status: 400 })
      }
      throw mintError
    }

    const { allFinalized } = await closeSessionIfComplete(supabaseAdmin, {
      session: session as any,
      sampleId: sample_id,
      validatedByCupperId: validated_by_cupper_id ?? null,
      actorId: user.id,
      decision,
      notes: notes ?? null,
      certificateNumber: certificate?.certificate_number,
      violations: outcome.violations,
      isManualDecision: verdict.source === 'override',
    })

    // Honest about what actually happened: a pending lot says why it is pending
    // rather than implying a certificate appeared.
    let message: string
    if (decision === 'pending') {
      message = outcome.reason
    } else if (certificate?.certificate_number) {
      message = `Sample ${decision} - Certificate ${certificate.certificate_number} created`
    } else {
      message = `Sample ${decision} - ${outcome.reason}`
    }

    return NextResponse.json({
      success: true,
      decision,
      // true | false | null, verbatim: null means the cup could not be judged.
      cupPassed: verdict.cupPassed,
      blocked: outcome.blocked,
      reason: outcome.reason,
      message,
      grading_pending: !hasGradingData,
      violations: outcome.violations,
      cva: {
        score: cvaScore,
        min_score: cvaMinScore,
        source: verdict.source,
      },
      sample: {
        id: sample_id,
        tracking_number: sample.tracking_number,
        status: decision,
        workflow_stage:
          decision === 'approved' ? 'certified' : decision === 'rejected' ? 'rejected' : 'review',
      },
      certificate,
      session_completed: allFinalized
    })
  } catch (error) {
    console.error('Error in POST /api/cupping/cva/finalize:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
