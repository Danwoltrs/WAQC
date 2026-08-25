import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  evaluateQualityCompliance,
  checkHasValidationRules,
  type QualityComplianceResult,
} from '@/lib/compliance'
import { excludeCvaScores } from '@/lib/cupping-protocol-scope'
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

      if (allCuppingScores) {
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

    // Mint the certificate — the mother plus one per sub-contract — and resolve
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
