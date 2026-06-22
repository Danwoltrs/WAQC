import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import {
  evaluateQualityCompliance,
  checkHasValidationRules,
  type QualityComplianceResult,
} from '@/lib/compliance'

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

    // Permission check: must be master cupper, Q-grader, or global admin
    const canFinalize = profile.is_global_admin ||
                        profile.is_master_cupper ||
                        profile.is_q_grader ||
                        session.cupper_ids?.includes(user.id)

    if (!canFinalize) {
      return NextResponse.json({
        error: 'You do not have permission to finalize this session'
      }, { status: 403 })
    }

    // Minimum cupper count validation (mirrors /api/cupping/validate logic)
    const rawCupperIds = (session.cupper_ids as string[]) || []
    const uniqueCupperIds = new Set(rawCupperIds)
    const assignedCupperCount = uniqueCupperIds.size
    const isSingleCupperSession = assignedCupperCount === 1

    const minCuppersRequired = (session.allow_single_cupper || isSingleCupperSession)
      ? 1
      : (session.min_cuppers_required || 2)

    // Count how many assigned cuppers have completed scores for this sample
    const { data: completedScores, error: scoresCountError } = await supabaseAdmin
      .from('cupping_scores')
      .select('cupper_id')
      .eq('sample_id', sample_id)
      .in('cupper_id', Array.from(uniqueCupperIds))

    const completedCupperIds = new Set(
      (completedScores || []).map((s: any) => s.cupper_id)
    )
    const completedCupperCount = completedCupperIds.size

    if (completedCupperCount < minCuppersRequired) {
      return NextResponse.json({
        error: `Cannot finalize: only ${completedCupperCount} of ${minCuppersRequired} required cuppers have completed their scores`
      }, { status: 400 })
    }

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

    // Get the currently assigned cupper IDs from the session
    // This ensures compliance evaluation only uses scores from assigned cuppers
    const sessionCupperIds = (session.cupper_ids as string[]) || []

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
        sessionCupperIds
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
      let cupScoreQuery = supabaseAdmin
        .from('cupping_scores')
        .select('defects, cupper_id')
        .eq('sample_id', sample_id)

      if (sessionCupperIds.length > 0) {
        cupScoreQuery = cupScoreQuery.in('cupper_id', sessionCupperIds)
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

    // Get current workflow stage to handle transitions correctly
    // Valid transitions: cupping → review → certified/rejected
    // We may need to transition through 'review' first
    const currentWorkflowStage = sample.workflow_stage

    // If coming from cupping or analysis, we need to go through review first
    if (currentWorkflowStage === 'cupping' || currentWorkflowStage === 'analysis') {
      // First transition to review
      const { error: reviewTransitionError } = await supabaseAdmin
        .from('samples')
        .update({
          workflow_stage: 'review',
          updated_at: new Date().toISOString()
        })
        .eq('id', sample_id)

      if (reviewTransitionError) {
        console.error('Error transitioning to review:', reviewTransitionError)
        return NextResponse.json({
          error: 'Failed to transition sample to review stage',
          details: reviewTransitionError.message
        }, { status: 500 })
      }
    }

    // Update sample status and workflow_stage based on completion state
    if (hasGradingData) {
      // Both cupping and grading complete - finalize to certified/rejected
      const { error: sampleUpdateError } = await supabaseAdmin
        .from('samples')
        .update({
          status: decision,
          workflow_stage: newWorkflowStage,
          updated_at: new Date().toISOString()
        })
        .eq('id', sample_id)

      if (sampleUpdateError) {
        console.error('Error updating sample:', sampleUpdateError)
        return NextResponse.json({
          error: 'Failed to update sample status',
          details: sampleUpdateError.message
        }, { status: 500 })
      }

      // Persist the seller-only approval note (approved samples only). Guarded
      // so a not-yet-applied migration never fails finalization.
      if (decision === 'approved' && sellerComment) {
        await supabaseAdmin
          .from('samples')
          .update({ seller_comment: sellerComment })
          .eq('id', sample_id)
          .then(undefined, () => undefined)
      }

      // Push the decision to the shared sys shipment_samples row immediately
      // (status + approver initials + QC marker), independent of email send.
      // On approval the seller comment rides along to sys approval_comments.
      await writeDecisionToShipmentSamples(
        supabaseAdmin,
        sample_id,
        user.id,
        decision === 'approved' ? sellerComment : null,
      )
    }
    // If no grading data, sample stays in 'review' stage (already transitioned above)

    // Create certificate only if both cupping AND grading are complete
    let certificate = null
    // Certificate validity window is per-client:
    // qc_client_settings.certificate_validity_months. NULL/0 → no expiry
    // window is printed on the certificate (the "Certificate validity period"
    // toggle is off for that client).
    const validFrom = new Date()
    let validUntil: Date | null = null
    {
      const { data: vSettings } = await (supabaseAdmin as any)
        .from('qc_client_settings')
        .select('certificate_validity_months')
        .eq('company_id', sample.client_id)
        .maybeSingle()
      const months = vSettings?.certificate_validity_months
      if (typeof months === 'number' && months > 0) {
        validUntil = new Date(validFrom)
        validUntil.setMonth(validUntil.getMonth() + months)
      }
    }

    // Other Samples don't generate Wolthers certificates — clients approve them
    // individually via the sample_recipients flow.
    const skipCertificate = (sample as any).sample_category === 'other'

    if (hasGradingData && !skipCertificate) {
      // Check if certificate already exists
      const { data: existingCert } = await supabaseAdmin
        .from('certificates')
        .select('id, certificate_number, is_rejected, compliance_violations, revision_number, approved')
        .eq('sample_id', sample_id)
        .is('sample_contract_id', null)
        .single()

      if (!existingCert) {
        // Validate tracking number before creating certificate
        if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
          console.error('Cannot create certificate: invalid tracking_number for sample', sample_id, sample.tracking_number)
          return NextResponse.json({
            error: 'Cannot generate certificate - sample has invalid tracking number',
            details: 'Please contact an administrator to fix the sample tracking number.'
          }, { status: 400 })
        }

        // Get client info for issued_to (now companies)
        const { data: client } = await (supabaseAdmin as any)
          .from('companies')
          .select('name, fantasy_name')
          .eq('id', sample.client_id)
          .single()

        const issuedTo = client?.fantasy_name || client?.name || 'Unknown Client'

        // Create certificate with compliance info
        const { data: newCert, error: certError } = await supabaseAdmin
          .from('certificates')
          .insert({
            sample_id: sample_id,
            certificate_number: null as unknown as string,
            issued_to: issuedTo,
            issued_by: user.id,
            status: 'issued',
            valid_from: validFrom.toISOString(),
            valid_until: validUntil ? validUntil.toISOString() : null,
            is_rejected: decision === 'rejected',
            compliance_violations: complianceResult.violations.length > 0
              ? complianceResult.violations
              : null,
          })
          .select('id, certificate_number, created_at, is_rejected, compliance_violations')
          .single()

        if (certError) {
          console.error('Error creating certificate:', certError)
          // Don't fail the entire request, just log the error
        } else {
          certificate = newCert
        }
      } else {
        // Re-certification: certificate already exists — track what changed
        const previousIsRejected = existingCert.is_rejected ?? false
        const previousViolations = (existingCert.compliance_violations as string[] | null) || []
        const newIsRejected = decision === 'rejected'
        const newViolations = complianceResult.violations

        // Build human-readable changes description
        const changes: string[] = []
        if (previousIsRejected !== newIsRejected) {
          changes.push(
            previousIsRejected
              ? 'Decision changed from REJECTED to APPROVED'
              : 'Decision changed from APPROVED to REJECTED'
          )
        }
        // Compare violations
        const addedViolations = newViolations.filter(v => !previousViolations.includes(v))
        const removedViolations = previousViolations.filter(v => !newViolations.includes(v))
        if (addedViolations.length > 0) {
          changes.push(`New violations: ${addedViolations.join('; ')}`)
        }
        if (removedViolations.length > 0) {
          changes.push(`Resolved violations: ${removedViolations.join('; ')}`)
        }
        if (changes.length === 0) {
          changes.push('Re-certified with no changes to decision or violations')
        }

        const changesDescription = changes.join('. ')
        const newRevisionNumber = (existingCert.revision_number ?? 0) + 1

        // Save version history before updating
        await supabaseAdmin
          .from('certificate_versions')
          .insert({
            certificate_id: existingCert.id,
            version_number: existingCert.revision_number ?? 0,
            changes_description: changesDescription,
            created_by: user.id,
          })

        // Update existing certificate — keep the already-assigned certificate number
        // Clear pdf_url so the download route regenerates the PDF with current data
        const { data: updatedCert, error: updateCertError } = await supabaseAdmin
          .from('certificates')
          .update({
            is_rejected: newIsRejected,
            approved: !newIsRejected,
            compliance_violations: newViolations.length > 0 ? newViolations : null,
            revision_number: newRevisionNumber,
            override_comment: `Re-certified (rev ${newRevisionNumber}): ${changesDescription}`,
            pdf_url: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCert.id)
          .select('id, certificate_number, created_at, is_rejected, compliance_violations')
          .single()

        if (!updateCertError) {
          certificate = updatedCert
        } else {
          certificate = existingCert
        }
      }
    }

    // Create certificates for sub-contracts (if any exist)
    if (hasGradingData && certificate) {
      try {
        const { data: subContracts } = await supabaseAdmin
          .from('sample_contracts')
          .select('id, tracking_number, client_id')
          .eq('sample_id', sample_id)
          .order('sort_order', { ascending: true })

        if (subContracts && subContracts.length > 0) {
          // Get mother's client name for fallback (now from companies)
          const { data: motherClient } = await (supabaseAdmin as any)
            .from('companies')
            .select('fantasy_name, name')
            .eq('id', sample.client_id)
            .single()
          const motherIssuedTo = motherClient?.fantasy_name || motherClient?.name || 'Unknown Client'

          for (const sc of subContracts) {
            // Check if sub-contract certificate already exists
            const { data: existingSubCert } = await supabaseAdmin
              .from('certificates')
              .select('id')
              .eq('sample_contract_id', sc.id)
              .maybeSingle()

            if (!existingSubCert) {
              // Get sub-contract's QC client name (or fall back to mother's)
              let subIssuedTo = motherIssuedTo
              if (sc.client_id && sc.client_id !== sample.client_id) {
                const { data: subClient } = await (supabaseAdmin as any)
                  .from('companies')
                  .select('fantasy_name, name')
                  .eq('id', sc.client_id)
                  .single()
                if (subClient) {
                  subIssuedTo = subClient.fantasy_name || subClient.name || subIssuedTo
                }
              }

              await supabaseAdmin
                .from('certificates')
                .insert({
                  sample_id: sample_id,
                  sample_contract_id: sc.id,
                  certificate_number: null as unknown as string,
                  issued_to: subIssuedTo,
                  issued_by: user.id,
                  status: 'issued',
                  valid_from: validFrom.toISOString(),
                  valid_until: validUntil ? validUntil.toISOString() : null,
                  is_rejected: decision === 'rejected',
                  compliance_violations: complianceResult.violations.length > 0
                    ? complianceResult.violations
                    : null,
                })
            }
          }
        }
      } catch (subContractCertError) {
        console.error('Error creating sub-contract certificates:', subContractCertError)
        // Non-fatal: mother certificate was already created
      }
    }

    // Check if all samples in session are finalized
    const remainingSamples = session.sample_ids.filter((id: string) => id !== sample_id)
    let allFinalized = true

    if (remainingSamples.length > 0) {
      const { data: otherSamples } = await supabaseAdmin
        .from('samples')
        .select('id, workflow_stage')
        .in('id', remainingSamples)

      allFinalized = otherSamples?.every(
        (s: any) => s.workflow_stage === 'certified' || s.workflow_stage === 'rejected'
      ) || false
    }

    // If no master cupper was designated, set the validating cupper as master
    // so that certificate-data.ts reads their resolved defects as authoritative
    if (!session.master_cupper_id && authoritativeCupperId) {
      await supabaseAdmin
        .from('cupping_sessions')
        .update({ master_cupper_id: authoritativeCupperId, updated_at: new Date().toISOString() })
        .eq('id', session_id)
    }

    // Update session status if all samples are finalized
    if (allFinalized) {
      const { error: sessionUpdateError } = await supabaseAdmin
        .from('cupping_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', session_id)

      if (sessionUpdateError) {
        console.error('Error updating session status:', sessionUpdateError)
      }
    }

    // Log to audit trail
    try {
      await supabaseAdmin
        .from('cupping_audit_log')
        .insert({
          session_id,
          sample_id,
          action: 'finalized',
          performed_by: user.id,
          details: {
            decision,
            notes,
            certificate_number: certificate?.certificate_number,
            violations: complianceResult.violations,
            auto_determined: !isManualDecision,
            manual_decision: isManualDecision,
            finalized_at: new Date().toISOString()
          },
          laboratory_id: session.laboratory_id
        })
    } catch (auditError) {
      console.error('Error logging audit:', auditError)
    }

    // Invalidate cached certificate PDF since finalization changes certificate data.
    // Awaited so the response doesn't return before the cache is cleared — otherwise the
    // client's immediate cert fetch can race the invalidation and get the pre-finalize PDF.
    try {
      await invalidateCertificatePdf(supabaseAdmin, sample_id)
    } catch (invalidationError) {
      console.error('[finalize] Failed to invalidate certificate PDF:', invalidationError)
    }

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
