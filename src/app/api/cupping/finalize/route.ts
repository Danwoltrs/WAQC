import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  evaluateQualityCompliance,
  checkHasValidationRules,
  type QualityComplianceResult,
} from '@/lib/compliance'
import { excludeCvaScores } from '@/lib/cupping-protocol-scope'
import { buildScoreResolution, includedRows, overallFromFinals } from '@/lib/cupping/score-resolution'
import { assertCanFinalize } from '@/lib/cupping/finalize-gate'
import {
  applyDecision,
  mintCertificates,
  closeSessionIfComplete,
  InvalidTrackingNumberError,
  type MintedCertificate,
} from '@/lib/cupping/finalize-pipeline'

// Create admin client with service role key (bypasses RLS)
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
 * POST /api/cupping/finalize
 * Finalize cupping scores for a session:
 * 1. Auto-determine approval/rejection based on quality specs (or use manual decision)
 * 2. Update session status to 'completed'
 * 3. Update sample workflow_stage to 'certified' or 'rejected'
 * 4. Create certificate record with generated certificate number (per-client atomic sequence)
 *
 * Body: {
 *   session_id: string,
 *   sample_id: string,
 *   notes?: string,
 *   manual_decision?: 'approved' | 'rejected' // Override auto-determination when no quality template
 * }
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
    const { session_id, sample_id, notes, manual_decision, validated_by_cupper_id } = body

    // How the panel was resolved on the validation screen. The default is the
    // AVERAGE of every cupper; whoever validates may drop a cupper from it
    // (excluded_cupper_ids) or take one cupper's card wholesale
    // (source_cupper_id), and may type over individual attributes
    // (final_scores). All three are explicit acts, and all three are frozen
    // into quality_assessments.score_resolution below so the gate, the PDF and
    // the public page read one agreed set of numbers.
    //
    // They arrive keyed on cupping_scores.id, not on cupper_id: the aggregate
    // route anonymises other cuppers for anyone who is not an admin or master
    // cupper, so a plain roster cupper never learns their colleagues' ids. The
    // score ids are resolved to cupper ids below, once the rows are loaded.
    const excludedScoreIds: string[] = Array.isArray(body.excluded_score_ids)
      ? body.excluded_score_ids.filter((id: unknown) => typeof id === 'string')
      : []
    const sourceScoreId: string | null =
      typeof body.source_score_id === 'string' ? body.source_score_id : null
    const submittedFinalScores: Record<string, number> = {}
    if (body.final_scores && typeof body.final_scores === 'object' && !Array.isArray(body.final_scores)) {
      for (const [attr, value] of Object.entries(body.final_scores as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) submittedFinalScores[attr] = value
      }
    }
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

    // Get user profile for permission check
    const { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, is_master_cupper, is_global_admin, is_q_grader, qc_role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get the session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('cupping_sessions')
      .select('*')
      .eq('id', session_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify sample is in session
    if (!session.sample_ids?.includes(sample_id)) {
      return NextResponse.json({
        error: 'Sample is not part of this session'
      }, { status: 400 })
    }

    // Count how many assigned cuppers have completed scores for this sample.
    // Commodity rows only — a CVA row is a different protocol, not a second opinion.
    const { data: completedScores } = await excludeCvaScores(supabaseAdmin
      .from('cupping_scores')
      .select('cupper_id')
      .eq('sample_id', sample_id))

    const gate = assertCanFinalize({
      session: session as any,
      sampleId: sample_id,
      actor: profile as any,
      completedCupperIds: ((completedScores ?? []) as any[])
        .map((s) => s.cupper_id)
        .filter(Boolean),
    })
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }
    const { assignedCupperIds: uniqueCupperIdsList, isSingleCupperSession } = gate

    // Get the sample with quality spec info and current workflow stage
    // Exclude soft-deleted samples
    const { data: sample, error: sampleError } = await supabaseAdmin
      .from('samples')
      .select('id, tracking_number, client_id, workflow_stage, status, quality_spec_id, origin, sample_category')
      .eq('id', sample_id)
      .is('deleted_at', null)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Check if grading data exists for this sample
    const { data: gradingData, error: gradingError } = await supabaseAdmin
      .from('quality_assessments')
      .select('id, green_bean_data')
      .eq('sample_id', sample_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const hasGradingData = !gradingError && gradingData && gradingData.green_bean_data

    // Freeze the panel resolution BEFORE the gate runs. evaluateQualityCompliance
    // reads quality_assessments.score_resolution AND resolved_defects, so
    // writing them first is what makes the approve/reject decision and the
    // certificate agree by construction rather than by both re-deriving the
    // same way. This matters most for the DEFECTS: the validation screen used
    // to PATCH the validator's removals onto the master cupper's own score row
    // before finalizing, and the gate read them back from there. It no longer
    // touches anyone's card, so unless the removals land here the gate would
    // judge a taint the panel agreed was a mis-flag and reject a lot whose
    // certificate prints a clean cup.
    let commodityScoreRows: Array<{ id: string; cupper_id: string | null; scores: unknown }> = []
    {
      let rowQuery = excludeCvaScores(supabaseAdmin
        .from('cupping_scores')
        .select('id, cupper_id, scores')
        .eq('sample_id', sample_id))
      if (uniqueCupperIdsList.length > 0) {
        rowQuery = rowQuery.in('cupper_id', uniqueCupperIdsList)
      }
      const { data: rows } = await rowQuery
      commodityScoreRows = (rows ?? []) as typeof commodityScoreRows
    }

    // score_id -> cupper_id, so the frozen resolution names people rather than
    // rows. A score id the client made up simply resolves to nothing and is
    // ignored — it can neither exclude a real cupper nor select one.
    const cupperOfScore = new Map(commodityScoreRows.map(r => [r.id, r.cupper_id]))
    const excludedCupperIds: string[] = excludedScoreIds
      .map(id => cupperOfScore.get(id))
      .filter((id): id is string => typeof id === 'string')
    const rawSourceCupperId: string | null =
      (sourceScoreId ? cupperOfScore.get(sourceScoreId) : null) ?? null
    // "Use Ana's card, but not Ana" has no meaning — cupperAttributeScores
    // looks Ana up among rows Ana has been filtered out of and returns {},
    // freezing an empty resolution. Fall back to the average.
    const sourceCupperId: string | null =
      rawSourceCupperId && excludedCupperIds.includes(rawSourceCupperId) ? null : rawSourceCupperId

    // The validator's settled taint/fault list, if the screen sent one.
    // Stamped with who settled it and when, the way score_resolution is. The
    // list itself is the validator's call — they may lower an intensity or drop
    // a mis-flag — but a decision that changes whether a lot passes should not
    // be anonymous. Every reader takes only .taints/.faults, so the two extra
    // keys are inert to them.
    const submittedResolvedDefects =
      body.resolved_defects && typeof body.resolved_defects === 'object' && !Array.isArray(body.resolved_defects)
        ? {
            taints: Array.isArray((body.resolved_defects as any).taints) ? (body.resolved_defects as any).taints : [],
            faults: Array.isArray((body.resolved_defects as any).faults) ? (body.resolved_defects as any).faults : [],
            resolved_by: profile.id,
            resolved_at: new Date().toISOString(),
          }
        : null

    if (commodityScoreRows.length > 0 || submittedResolvedDefects) {
      const base = buildScoreResolution({
        protocol: 'commodity',
        mode: sourceCupperId ? 'cupper' : 'average',
        rows: commodityScoreRows as any,
        sourceCupperId,
        excludedCupperIds,
        resolvedBy: profile.id,
        resolvedAt: new Date().toISOString(),
      })
      // The validator's typed values are taken VERBATIM: the modal already
      // snapped each one to that attribute's own increment and refuses to
      // finalize while any value sits off it, so re-snapping here (where the
      // per-attribute increments are not loaded) could only move a correct
      // number onto the wrong grid.
      //
      // But only for attributes the INCLUDED cuppers actually scored. Anything
      // else could only have come from a cupper the panel excluded, and
      // freezing it would put that cupper's number on the certificate under an
      // `excluded_cupper_ids` entry saying they were thrown out. The server
      // decides this, not the screen: excluded_cupper_ids and final_scores both
      // arrive from the client and have to be made consistent here.
      const scorable = new Set<string>()
      for (const row of includedRows(commodityScoreRows as any, excludedCupperIds)) {
        const rowScores = (row as any).scores
        if (!rowScores || typeof rowScores !== 'object') continue
        // Same rule buildScoreResolution applies: a CVA envelope is not an
        // attribute map. Without this the allow-list would readmit exactly the
        // keys the base deliberately dropped (version / score / u / d) for any
        // row whose `protocol` column is null but whose blob is a CVA one.
        if ((rowScores as Record<string, unknown>).protocol === 'cva') continue
        for (const [attr, value] of Object.entries(rowScores)) {
          if (typeof value === 'number' && Number.isFinite(value)) scorable.add(attr)
        }
      }
      const acceptedOverrides: Record<string, number> = {}
      for (const [attr, value] of Object.entries(submittedFinalScores)) {
        if (scorable.has(attr)) acceptedOverrides[attr] = value
      }
      const finalScores = { ...base.final_scores, ...acceptedOverrides }
      const scoreResolution = {
        ...base,
        final_scores: finalScores,
        overall_score: overallFromFinals(finalScores),
      }

      // Only write score_resolution when there were commodity cards to resolve;
      // a defects-only submission must not stamp an empty resolution over a lot
      // that has none.
      const preGateWrite: Record<string, unknown> = {}
      if (commodityScoreRows.length > 0) preGateWrite.score_resolution = scoreResolution
      if (submittedResolvedDefects) preGateWrite.resolved_defects = submittedResolvedDefects

      const { error: resolutionError } = gradingData?.id
        ? await supabaseAdmin
            .from('quality_assessments')
            .update(preGateWrite as any)
            .eq('id', gradingData.id)
        : await supabaseAdmin
            .from('quality_assessments')
            .insert({ sample_id, ...preGateWrite } as any)

      if (resolutionError) {
        // The gate would then judge re-derived numbers while the certificate
        // printed something else. Refuse rather than certify on a split brain.
        console.error('[finalize] pre-gate resolution write failed for sample', sample_id, resolutionError)
        return NextResponse.json({
          error: 'Failed to record the agreed cupping result - nothing was certified',
        }, { status: 500 })
      }
    }

    // Auto-determine approval/rejection based on quality specifications
    // Only evaluate compliance if grading data exists
    let complianceResult: QualityComplianceResult = { approved: true, violations: [] }
    let decision: 'approved' | 'rejected' | 'pending' = 'pending'
    let newWorkflowStage: string
    let isManualDecision = false

    if (hasGradingData) {
      // Both cupping and grading are complete - evaluate compliance
      complianceResult = await evaluateQualityCompliance(
        supabaseAdmin,
        sample_id,
        sample.quality_spec_id,
        uniqueCupperIdsList
      )

      // Check if manual decision is provided and there's no quality template (auto-approve scenario)
      // Manual decision only applies when there are no validation rules to override
      if (manual_decision && (manual_decision === 'approved' || manual_decision === 'rejected')) {
        // Check if quality spec has a template with validation rules
        const hasValidationRules = await checkHasValidationRules(supabaseAdmin, sample.quality_spec_id)

        if (!hasValidationRules) {
          // No validation rules - use manual decision
          decision = manual_decision
          isManualDecision = true
          complianceResult = {
            approved: manual_decision === 'approved',
            violations: manual_decision === 'rejected'
              ? ['Manual rejection by cupper']
              : []
          }
        } else {
          // Has validation rules - use auto-determined result
          decision = complianceResult.approved ? 'approved' : 'rejected'
        }
      } else {
        decision = complianceResult.approved ? 'approved' : 'rejected'
      }

      newWorkflowStage = decision === 'approved' ? 'certified' : 'rejected'
    } else {
      // Only cupping is complete - move to review stage, awaiting grading
      decision = 'pending'
      newWorkflowStage = 'review'
    }

    // Determine authoritative cupper for defects (used for cup status + certificate)
    const authoritativeCupperId: string | null =
      session.master_cupper_id || validated_by_cupper_id || null

    // Auto-calculate Clean Cup and Uniform Cup from defect counts
    try {
      // Count total taints and faults from assigned cuppers' scores only
      let cupScoreQuery = excludeCvaScores(supabaseAdmin
        .from('cupping_scores')
        .select('defects, cupper_id')
        .eq('sample_id', sample_id))

      if (uniqueCupperIdsList.length > 0) {
        cupScoreQuery = cupScoreQuery.in('cupper_id', uniqueCupperIdsList)
      }

      const { data: allCuppingScores } = await cupScoreQuery

      let totalTaints = 0
      let totalFaults = 0
      // The exact defect list the validator resolved. Persisted to
      // quality_assessments.resolved_defects below so the certificate reads it
      // directly instead of re-deriving via the master-cupper inference chain.
      let resolvedDefects: { taints: unknown[]; faults: unknown[] } = { taints: [], faults: [] }

      // The validator's own resolution, when the validation screen sent one.
      // It is what the screen displayed after the mode toggles and the per-defect
      // X buttons, so it beats any re-derivation here. Sending it also means the
      // screen no longer has to write those defects onto another cupper's score
      // row first — a plain cupper on the roster may validate, and overwriting a
      // colleague's card to do it was both a permission problem and a lie about
      // what that colleague found.
      const submittedDefects = submittedResolvedDefects

      if (submittedDefects) {
        resolvedDefects = {
          taints: Array.isArray(submittedDefects.taints) ? submittedDefects.taints : [],
          faults: Array.isArray(submittedDefects.faults) ? submittedDefects.faults : [],
        }
        totalTaints = resolvedDefects.taints.length
        totalFaults = resolvedDefects.faults.length
      } else if (allCuppingScores) {
        if (authoritativeCupperId) {
          // Use the authoritative cupper's defects (master cupper or validator)
          const authScore = allCuppingScores.find(
            (s: any) => s.cupper_id === authoritativeCupperId
          )
          if (authScore?.defects && typeof authScore.defects === 'object') {
            const defects = authScore.defects as { taints?: unknown[]; faults?: unknown[] }
            totalTaints = Array.isArray(defects.taints) ? defects.taints.length : 0
            totalFaults = Array.isArray(defects.faults) ? defects.faults.length : 0
            resolvedDefects = {
              taints: Array.isArray(defects.taints) ? defects.taints : [],
              faults: Array.isArray(defects.faults) ? defects.faults : [],
            }
          }
        } else {
          // No authoritative cupper: use MAX consolidation across all cuppers
          for (const score of allCuppingScores) {
            if (score.defects && typeof score.defects === 'object') {
              const defects = score.defects as { taints?: unknown[]; faults?: unknown[] }
              if (Array.isArray(defects.taints)) {
                totalTaints = Math.max(totalTaints, defects.taints.length)
              }
              if (Array.isArray(defects.faults)) {
                totalFaults = Math.max(totalFaults, defects.faults.length)
              }
            }
          }
        }
      }

      // Fetch quality template's cup_status_rules from parameters
      let cupStatusRules: { clean_cup: { max_taints: number; max_faults: number }; uniform_cup: { max_taints: number; max_faults: number } } | null = null

      if (sample.quality_spec_id) {
        const { data: specData } = await supabaseAdmin
          .from('client_qualities')
          .select('template:quality_templates(parameters)')
          .eq('id', sample.quality_spec_id)
          .single()

        if (specData?.template) {
          const params = (specData.template as any).parameters
          if (params?.cup_status_rules) {
            cupStatusRules = params.cup_status_rules
          }
        }
      }

      // Default rules: zero tolerance (SCA standard)
      const rules = cupStatusRules || {
        clean_cup: { max_taints: 0, max_faults: 0 },
        uniform_cup: { max_taints: 0, max_faults: 0 },
      }

      const cleanCupAuto = totalTaints <= rules.clean_cup.max_taints && totalFaults <= rules.clean_cup.max_faults
      const uniformCupAuto = totalTaints <= rules.uniform_cup.max_taints && totalFaults <= rules.uniform_cup.max_faults

      // Write to quality_assessments (only set clean_cup/uniform_cup if not already overridden)
      const { data: existingQA } = await supabaseAdmin
        .from('quality_assessments')
        .select('id, clean_cup, uniform_cup')
        .eq('sample_id', sample_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existingQA) {
        // Preserve manual overrides: only update clean_cup/uniform_cup if they haven't been manually set
        // (i.e., if clean_cup_auto differs from clean_cup, user has overridden)
        const updateData: Record<string, unknown> = {
          clean_cup_auto: cleanCupAuto,
          uniform_cup_auto: uniformCupAuto,
          // Always overwrite resolved_defects with the validator's resolution.
          // This is what the certificate renders — bypasses any master-cupper inference.
          resolved_defects: resolvedDefects,
        }
        // On first finalization, always set clean_cup/uniform_cup to auto values
        if (existingQA.clean_cup === null) {
          updateData.clean_cup = cleanCupAuto
        }
        if (existingQA.uniform_cup === null) {
          updateData.uniform_cup = uniformCupAuto
        }

        const { error: qaUpdateError } = await supabaseAdmin
          .from('quality_assessments')
          .update(updateData)
          .eq('id', existingQA.id)
        if (qaUpdateError) {
          // Surface silent failures (e.g. resolved_defects column missing if the
          // migration isn't applied). The cert will fall back to legacy logic and
          // exhibit the "removed taints still show" bug — log loudly so we notice.
          console.error('[finalize] quality_assessments UPDATE failed for sample', sample_id, qaUpdateError)
        }
      } else {
        // No existing quality_assessments row — create one so the cert has a
        // resolved_defects source even before grading data is filled in.
        const { error: qaInsertError } = await supabaseAdmin
          .from('quality_assessments')
          .insert({
            sample_id,
            clean_cup: cleanCupAuto,
            uniform_cup: uniformCupAuto,
            clean_cup_auto: cleanCupAuto,
            uniform_cup_auto: uniformCupAuto,
            resolved_defects: resolvedDefects,
          })
        if (qaInsertError) {
          console.error('[finalize] quality_assessments INSERT failed for sample', sample_id, qaInsertError)
        }
      }
    } catch (cupStatusError) {
      console.error('Error calculating cup status:', cupStatusError)
      // Non-fatal: continue with finalization even if cup status calculation fails
    }

    // Move the sample through its workflow stages, persist the seller comment
    // and push the decision to sys. Protocol-agnostic — shared with the CVA
    // route via finalize-pipeline.ts. `decision === 'pending'` (no grading data
    // yet) stops after the review transition; see applyDecision for the rest.
    const currentWorkflowStage = sample.workflow_stage

    await applyDecision(supabaseAdmin, {
      sampleId: sample_id,
      decision,
      currentWorkflowStage,
      actorUserId: user.id,
      sellerComment,
    })

    // Mint the certificates — one per member of the contract group — and resolve
    // the per-client validity window. Protocol-agnostic — shared with the CVA
    // route via finalize-pipeline.ts. Nothing here generates a number: the
    // certificate reuses the sample's tracking number, assigned server-side by
    // the assign_certificate_number trigger. `decision === 'pending'` (no
    // grading data yet) mints nothing, same as the old `hasGradingData` gate.
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
        violations: complianceResult.violations,
        actorUserId: user.id,
      })
      certificate = minted.certificate
    } catch (mintError) {
      // A broken tracking number stays a 400 with actionable detail, exactly as
      // the inline code returned it — not the outer catch's generic 500. The
      // sample has already been moved by applyDecision at this point, which is
      // also what the inline early return did.
      if (mintError instanceof InvalidTrackingNumberError) {
        return NextResponse.json({
          error: mintError.message,
          details: mintError.details
        }, { status: 400 })
      }
      throw mintError
    }

    // Close out the session: check whether every OTHER sample in it already
    // reached certified/rejected, backfill the master cupper when none was
    // designated, roll the session to 'completed' once everything has
    // resolved, write the audit-trail entry, and invalidate the cached
    // certificate PDF. Protocol-agnostic — shared with the CVA route via
    // finalize-pipeline.ts.
    const { allFinalized } = await closeSessionIfComplete(supabaseAdmin, {
      session: session as any,
      sampleId: sample_id,
      validatedByCupperId: validated_by_cupper_id,
      actorId: user.id,
      decision,
      notes,
      certificateNumber: certificate?.certificate_number,
      violations: complianceResult.violations,
      isManualDecision,
    })

    // Build response message based on completion state
    let message: string
    if (decision === 'pending') {
      message = `Cupping scores finalized - Sample moved to Review. Certificate will be generated after grading is complete.`
    } else if (decision === 'approved') {
      message = `Sample approved - Certificate ${certificate?.certificate_number || sample.tracking_number} generated`
    } else {
      message = `Sample rejected - Certificate ${certificate?.certificate_number || 'R-' + sample.tracking_number} generated`
    }

    return NextResponse.json({
      success: true,
      decision,
      message,
      grading_pending: !hasGradingData,
      violations: complianceResult.violations,
      sample: {
        id: sample_id,
        tracking_number: sample.tracking_number,
        status: decision,
        workflow_stage: newWorkflowStage
      },
      certificate,
      session_completed: allFinalized
    })
  } catch (error) {
    console.error('Error in POST /api/cupping/finalize:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// evaluateQualityCompliance and checkHasValidationRules are imported from @/lib/compliance
