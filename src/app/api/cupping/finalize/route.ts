import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'

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

interface QualityComplianceResult {
  approved: boolean
  violations: string[]
}

interface QualityTemplateParameters {
  cupping_attributes?: Record<string, { min?: number; max?: number }>
  defect_limits?: Record<string, { max_level?: number }>
  defect_configuration?: {
    thresholds?: {
      max_primary?: number
      max_secondary?: number
      max_total?: number
    }
  }
  screen_sizes?: Record<string, { min_percent?: number; max_percent?: number }>
  taint_fault_configuration?: {
    rules?: {
      max_taints?: number
      max_faults?: number
      max_combined?: number
      zero_tolerance?: boolean
    }
  }
  cup_status_rules?: {
    clean_cup: { max_taints: number; max_faults: number }
    uniform_cup: { max_taints: number; max_faults: number }
  }
  screen_size_requirements?: {
    constraints?: Array<{
      screen_size: string
      constraint_type: 'minimum' | 'maximum' | 'range' | 'exact'
      min_value?: number
      max_value?: number
    }>
  }
  moisture_min?: number
  moisture_max?: number
  max_quakers?: number
}

/**
 * POST /api/cupping/finalize
 * Finalize cupping scores for a session:
 * 1. Auto-determine approval/rejection based on quality specs (or use manual decision)
 * 2. Update session status to 'completed'
 * 3. Update sample workflow_stage to 'certified' or 'rejected'
 * 4. Create certificate record with tracking_number (R- prefix if rejected)
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
    const { session_id, sample_id, notes, manual_decision } = body

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
      .select('id, tracking_number, client_id, workflow_stage, status, quality_spec_id')
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
        sample_id,
        sample.quality_spec_id,
        sessionCupperIds
      )

      // Check if manual decision is provided and there's no quality template (auto-approve scenario)
      // Manual decision only applies when there are no validation rules to override
      if (manual_decision && (manual_decision === 'approved' || manual_decision === 'rejected')) {
        // Check if quality spec has a template with validation rules
        const hasValidationRules = await checkHasValidationRules(sample.quality_spec_id)

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

    // Auto-calculate Clean Cup and Uniform Cup from defect counts
    try {
      // Count total taints and faults from assigned cuppers' scores only
      let cupScoreQuery = supabaseAdmin
        .from('cupping_scores')
        .select('defects')
        .eq('sample_id', sample_id)

      if (sessionCupperIds.length > 0) {
        cupScoreQuery = cupScoreQuery.in('cupper_id', sessionCupperIds)
      }

      const { data: allCuppingScores } = await cupScoreQuery

      // Use MAX consolidation: the number of defective cups = MAX reported by any single cupper
      let totalTaints = 0
      let totalFaults = 0

      if (allCuppingScores) {
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
        }
        // On first finalization, always set clean_cup/uniform_cup to auto values
        if (existingQA.clean_cup === null) {
          updateData.clean_cup = cleanCupAuto
        }
        if (existingQA.uniform_cup === null) {
          updateData.uniform_cup = uniformCupAuto
        }

        await supabaseAdmin
          .from('quality_assessments')
          .update(updateData)
          .eq('id', existingQA.id)
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
    }
    // If no grading data, sample stays in 'review' stage (already transitioned above)

    // Create certificate only if both cupping AND grading are complete
    let certificate = null
    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    if (hasGradingData) {
      // Check if certificate already exists
      const { data: existingCert } = await supabaseAdmin
        .from('certificates')
        .select('id, certificate_number')
        .eq('sample_id', sample_id)
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

        // Certificate number uses tracking_number (R- prefix for rejected)
        const certificateNumber = decision === 'rejected'
          ? `R-${sample.tracking_number}`
          : sample.tracking_number

        // Get client info for issued_to
        const { data: client } = await supabaseAdmin
          .from('clients')
          .select('name, company, fantasy_name')
          .eq('id', sample.client_id)
          .single()

        const issuedTo = client?.fantasy_name || client?.company || client?.name || 'Unknown Client'

        // Create certificate with compliance info
        const { data: newCert, error: certError } = await supabaseAdmin
          .from('certificates')
          .insert({
            sample_id: sample_id,
            certificate_number: certificateNumber,
            issued_to: issuedTo,
            issued_by: user.id,
            status: 'issued',
            valid_from: validFrom.toISOString(),
            valid_until: validUntil.toISOString(),
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
        // Update existing certificate if decision changed
        const { data: updatedCert, error: updateCertError } = await supabaseAdmin
          .from('certificates')
          .update({
            certificate_number: decision === 'rejected'
              ? `R-${sample.tracking_number}`
              : sample.tracking_number,
            is_rejected: decision === 'rejected',
            compliance_violations: complianceResult.violations.length > 0
              ? complianceResult.violations
              : null,
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
          // Get mother's client name for fallback
          const { data: motherClient } = await supabaseAdmin
            .from('clients')
            .select('fantasy_name, company')
            .eq('id', sample.client_id)
            .single()
          const motherIssuedTo = motherClient?.fantasy_name || motherClient?.company || 'Unknown Client'

          for (const sc of subContracts) {
            // Check if sub-contract certificate already exists
            const { data: existingSubCert } = await supabaseAdmin
              .from('certificates')
              .select('id')
              .eq('sample_contract_id', sc.id)
              .maybeSingle()

            if (!existingSubCert) {
              const subCertNumber = decision === 'rejected'
                ? `R-${sc.tracking_number}`
                : sc.tracking_number

              // Get sub-contract's QC client name (or fall back to mother's)
              let subIssuedTo = motherIssuedTo
              if (sc.client_id && sc.client_id !== sample.client_id) {
                const { data: subClient } = await supabaseAdmin
                  .from('clients')
                  .select('fantasy_name, company')
                  .eq('id', sc.client_id)
                  .single()
                if (subClient) {
                  subIssuedTo = subClient.fantasy_name || subClient.company || subIssuedTo
                }
              }

              await supabaseAdmin
                .from('certificates')
                .insert({
                  sample_id: sample_id,
                  sample_contract_id: sc.id,
                  certificate_number: subCertNumber,
                  issued_to: subIssuedTo,
                  issued_by: user.id,
                  status: 'issued',
                  valid_from: validFrom.toISOString(),
                  valid_until: validUntil.toISOString(),
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

    // Invalidate cached certificate PDF since finalization changes certificate data
    invalidateCertificatePdf(supabaseAdmin, sample_id).catch(() => {})

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

// Type for cupping attribute config (array format from templates)
interface CuppingAttributeConfig {
  attribute: string
  validation_rule?: {
    type?: string
    min_value?: number
    max_value?: number
  }
  scale?: {
    min?: number
    max?: number
    type?: string
  }
}

/**
 * Evaluate quality compliance against quality specifications
 * A sample is REJECTED if ANY of these fail:
 * 1. Cupping attributes - Any attribute below min or above max
 * 2. Defect intensity levels - Any taint/fault exceeds max level
 * 3. Primary defect count - Exceeds threshold
 * 4. Secondary defect count - Exceeds threshold
 * 5. Total defect count - Exceeds threshold (if defined)
 * 6. Screen size distribution - Doesn't meet requirements
 */
async function evaluateQualityCompliance(
  sampleId: string,
  qualitySpecId: string | null,
  assignedCupperIds?: string[]
): Promise<QualityComplianceResult> {
  const violations: string[] = []

  // If no quality spec, auto-approve (no thresholds to check)
  if (!qualitySpecId) {
    console.log('No quality spec assigned, auto-approving')
    return { approved: true, violations: [] }
  }

  // Fetch quality spec with template
  const { data: qualitySpec, error: specError } = await supabaseAdmin
    .from('client_qualities')
    .select(`
      id,
      custom_name,
      template:quality_templates(
        id,
        name,
        parameters,
        defect_thresholds_primary,
        defect_thresholds_secondary,
        max_taints_allowed,
        max_faults_allowed,
        screen_size_requirements
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (specError || !qualitySpec?.template) {
    console.log('Quality spec or template not found, auto-approving')
    return { approved: true, violations: [] }
  }

  const template = qualitySpec.template as any
  const parameters = template.parameters as QualityTemplateParameters || {}

  // Fetch cupping scores for this sample, filtered to currently assigned cuppers only
  // This prevents old scores from removed cuppers from affecting compliance evaluation
  let scoreQuery = supabaseAdmin
    .from('cupping_scores')
    .select('scores, defects, cupper_id, session_id')
    .eq('sample_id', sampleId)

  if (assignedCupperIds && assignedCupperIds.length > 0) {
    scoreQuery = scoreQuery.in('cupper_id', assignedCupperIds)
  }

  const { data: cuppingScores } = await scoreQuery

  // Fetch grading data (green bean analysis)
  const { data: qualityAssessment } = await supabaseAdmin
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // 1. Check cupping attributes against thresholds
  // Handle both array format (new) and object format (legacy) for cupping_attributes
  if (cuppingScores && cuppingScores.length > 0 && parameters.cupping_attributes) {
    // Find the master cupper's session for this sample
    const { data: sampleSession } = await supabaseAdmin
      .from('cupping_sessions')
      .select('master_cupper_id')
      .contains('sample_ids', [sampleId])
      .in('status', ['active', 'review', 'completed', 'finalized'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const sessionMasterCupperId = sampleSession?.master_cupper_id || null

    // Get final scores: use master cupper's scores if designated, otherwise mean
    const finalScores: Record<string, number> = {}

    if (sessionMasterCupperId) {
      // Master cupper's scores are authoritative
      const masterScore = cuppingScores.find(s => s.cupper_id === sessionMasterCupperId)
      if (masterScore?.scores && typeof masterScore.scores === 'object') {
        for (const [attr, value] of Object.entries(masterScore.scores as Record<string, number>)) {
          if (typeof value === 'number') {
            finalScores[attr] = value
          }
        }
      }
    }

    // Fill in any missing attributes with mean across cuppers
    for (const score of cuppingScores) {
      if (score.scores && typeof score.scores === 'object') {
        for (const [attr, value] of Object.entries(score.scores as Record<string, number>)) {
          if (typeof value === 'number' && finalScores[attr] === undefined) {
            // Not set by master cupper, compute mean
            let sum = 0
            let count = 0
            for (const s of cuppingScores) {
              const sv = (s.scores as Record<string, number>)?.[attr]
              if (typeof sv === 'number') { sum += sv; count++ }
            }
            finalScores[attr] = count > 0 ? sum / count : value
          }
        }
      }
    }

    // Build a lookup map for validation rules
    // Handle both array format (new templates) and object format (legacy)
    const validationMap: Record<string, { min?: number; max?: number }> = {}

    if (Array.isArray(parameters.cupping_attributes)) {
      // New array format: [{attribute: "Acidity", validation_rule: {min_value: 3, max_value: 5}}, ...]
      for (const attrConfig of parameters.cupping_attributes as CuppingAttributeConfig[]) {
        if (attrConfig.attribute && attrConfig.validation_rule) {
          validationMap[attrConfig.attribute] = {
            min: attrConfig.validation_rule.min_value,
            max: attrConfig.validation_rule.max_value,
          }
        }
      }
    } else {
      // Legacy object format: {Acidity: {min: 3, max: 5}, ...}
      for (const [attr, limits] of Object.entries(parameters.cupping_attributes)) {
        if (limits && typeof limits === 'object') {
          const l = limits as { min?: number; max?: number }
          validationMap[attr] = { min: l.min, max: l.max }
        }
      }
    }

    // Check final scores against thresholds
    for (const [attr, score] of Object.entries(finalScores)) {
      // Try exact match first, then case-insensitive match
      let limits = validationMap[attr]
      if (!limits) {
        const lowerAttr = attr.toLowerCase()
        for (const [key, val] of Object.entries(validationMap)) {
          if (key.toLowerCase() === lowerAttr) {
            limits = val
            break
          }
        }
      }

      if (limits) {
        if (limits.min !== undefined && score < limits.min) {
          violations.push(`${attr}: ${score.toFixed(2)} is below minimum (${limits.min})`)
        }
        if (limits.max !== undefined && score > limits.max) {
          violations.push(`${attr}: ${score.toFixed(2)} is above maximum (${limits.max})`)
        }
      }
    }
  }

  // 2. Check defect intensity levels against per-defect thresholds
  // Cupping scores store defects as: { taints: [{name, intensity, cups_affected}], faults: [...] }
  if (cuppingScores && parameters.defect_limits) {
    for (const score of cuppingScores) {
      if (score.defects && typeof score.defects === 'object') {
        const defects = score.defects as { taints?: Array<{ name?: string; intensity?: number }>; faults?: Array<{ name?: string; intensity?: number }> }

        // Check taints
        if (Array.isArray(defects.taints)) {
          for (const taint of defects.taints) {
            const defectName = taint.name?.toLowerCase()
            if (!defectName) continue
            const defectIntensity = taint.intensity || 0
            const limit = parameters.defect_limits[defectName]

            if (limit?.max_level !== undefined && defectIntensity > limit.max_level) {
              violations.push(`Taint "${taint.name}": Intensity ${defectIntensity} exceeds maximum (${limit.max_level})`)
            }
          }
        }

        // Check faults
        if (Array.isArray(defects.faults)) {
          for (const fault of defects.faults) {
            const defectName = fault.name?.toLowerCase()
            if (!defectName) continue
            const defectIntensity = fault.intensity || 0
            const limit = parameters.defect_limits[defectName]

            if (limit?.max_level !== undefined && defectIntensity > limit.max_level) {
              violations.push(`Fault "${fault.name}": Intensity ${defectIntensity} exceeds maximum (${limit.max_level})`)
            }
          }
        }
      }
    }
  }

  // 3 & 4 & 5. Check defect counts from grading data
  if (qualityAssessment?.green_bean_data) {
    const greenBean = qualityAssessment.green_bean_data as any
    const defects = greenBean.defects

    if (defects) {
      // Grading page stores weighted totals as defects.primary / defects.secondary
      const primaryCount = defects.primary || 0
      const secondaryCount = defects.secondary || 0

      // Defect thresholds can come from template columns OR parameters.defect_configuration.thresholds
      const defectConfig = parameters.defect_configuration as { thresholds?: { max_primary?: number; max_secondary?: number; max_total?: number } } | undefined
      const maxPrimary = template.defect_thresholds_primary ?? defectConfig?.thresholds?.max_primary ?? null
      const maxSecondary = template.defect_thresholds_secondary ?? defectConfig?.thresholds?.max_secondary ?? null
      const maxTotal = (parameters as any).defect_thresholds_total ?? defectConfig?.thresholds?.max_total ?? null

      // Check primary defect count
      if (maxPrimary !== null && primaryCount > maxPrimary) {
        violations.push(`Primary defects: ${primaryCount} exceeds limit (${maxPrimary})`)
      }

      // Check secondary defect count
      if (maxSecondary !== null && secondaryCount > maxSecondary) {
        violations.push(`Secondary defects: ${secondaryCount} exceeds limit (${maxSecondary})`)
      }

      // Check total defect count (primary + secondary)
      const totalCount = primaryCount + secondaryCount
      if (maxTotal !== null && totalCount > maxTotal) {
        violations.push(`Total defects: ${totalCount} exceeds limit (${maxTotal})`)
      }
    }

    // Note: taint/fault counts are checked in step 9 from cupping scores (not green bean data)

    // Convert screen size grams to percentages (grading page stores grams, requirements are in %)
    let screenPercentages: Record<string, number> | null = null
    if (greenBean.screen_sizes && typeof greenBean.screen_sizes === 'object') {
      const rawSizes = greenBean.screen_sizes as Record<string, number>
      const totalGrams = Object.values(rawSizes).reduce((sum, g) => sum + (g || 0), 0)
      if (totalGrams > 0) {
        screenPercentages = {}
        for (const [size, grams] of Object.entries(rawSizes)) {
          screenPercentages[size] = (grams / totalGrams) * 100
        }
      }
    }

    // 6. Check screen size distribution (legacy template-level format)
    if (screenPercentages && template.screen_size_requirements) {
      const requirements = template.screen_size_requirements as Record<string, { min_percent?: number; max_percent?: number }>

      for (const [size, req] of Object.entries(requirements)) {
        const actualPercent = screenPercentages[size] || 0

        if (req.min_percent !== undefined && actualPercent < req.min_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% is below minimum (${req.min_percent}%)`)
        }
        if (req.max_percent !== undefined && actualPercent > req.max_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% exceeds maximum (${req.max_percent}%)`)
        }
      }
    }

    // 6b. Check screen size distribution (new constraint-based format from parameters)
    if (screenPercentages && parameters.screen_size_requirements?.constraints) {
      for (const constraint of parameters.screen_size_requirements.constraints) {
        const actualPercent = screenPercentages[constraint.screen_size] || 0

        switch (constraint.constraint_type) {
          case 'minimum':
            if (constraint.min_value !== undefined && actualPercent < constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% is below minimum (${constraint.min_value}%)`)
            }
            break
          case 'maximum':
            if (constraint.max_value !== undefined && actualPercent > constraint.max_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% exceeds maximum (${constraint.max_value}%)`)
            }
            break
          case 'range':
            if (constraint.min_value !== undefined && actualPercent < constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% is below minimum (${constraint.min_value}%)`)
            }
            if (constraint.max_value !== undefined && actualPercent > constraint.max_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% exceeds maximum (${constraint.max_value}%)`)
            }
            break
          case 'exact':
            if (constraint.min_value !== undefined && actualPercent !== constraint.min_value) {
              violations.push(`Screen ${constraint.screen_size}: ${actualPercent.toFixed(1)}% does not match expected (${constraint.min_value}%)`)
            }
            break
        }
      }
    }

    // 7. Check moisture limits
    if (greenBean.moisture_percentage !== undefined && greenBean.moisture_percentage !== null) {
      if (parameters.moisture_min !== undefined && greenBean.moisture_percentage < parameters.moisture_min) {
        violations.push(`Moisture: ${greenBean.moisture_percentage}% is below minimum (${parameters.moisture_min}%)`)
      }
      if (parameters.moisture_max !== undefined && greenBean.moisture_percentage > parameters.moisture_max) {
        violations.push(`Moisture: ${greenBean.moisture_percentage}% exceeds maximum (${parameters.moisture_max}%)`)
      }
    }

    // 8. Check quaker count
    // Grading page stores as green_bean_data.quakers, legacy may use quaker_count
    if (parameters.max_quakers !== undefined) {
      const quakerCount = greenBean.quakers ?? greenBean.quaker_count ?? 0
      if (quakerCount > parameters.max_quakers) {
        violations.push(`Quakers: ${quakerCount} exceeds maximum (${parameters.max_quakers})`)
      }
    }
  }

  // 9. Check cupping taint/fault counts against taint_fault_configuration rules
  // Falls back to template-level max_taints_allowed / max_faults_allowed columns
  if (cuppingScores && cuppingScores.length > 0) {
    const tfConfig = parameters.taint_fault_configuration
    const tfRules = tfConfig?.rules

    // Count taints and faults using MAX consolidation across cuppers
    // When multiple cuppers each find a defect, use the MAX cups from any single cupper
    let maxTaints = 0
    let maxFaults = 0

    for (const score of cuppingScores) {
      if (score.defects && typeof score.defects === 'object') {
        const defects = score.defects as { taints?: unknown[]; faults?: unknown[] }
        if (Array.isArray(defects.taints)) {
          maxTaints = Math.max(maxTaints, defects.taints.length)
        }
        if (Array.isArray(defects.faults)) {
          maxFaults = Math.max(maxFaults, defects.faults.length)
        }
      }
    }

    // Use MAX consolidated counts (not averaged)
    const avgTaints = maxTaints
    const avgFaults = maxFaults

    // Check if tfRules has any actual configuration
    const hasConfiguredRules = tfRules && (
      tfRules.zero_tolerance === true ||
      (typeof tfRules.max_taints === 'number') ||
      (typeof tfRules.max_faults === 'number') ||
      (typeof tfRules.max_combined === 'number')
    )

    if (hasConfiguredRules) {
      // Use parameters-level taint_fault_configuration rules
      if (tfRules!.zero_tolerance && (avgTaints > 0 || avgFaults > 0)) {
        violations.push(`Zero tolerance: ${avgTaints} taint(s) and ${avgFaults} fault(s) detected`)
      } else {
        if (typeof tfRules!.max_taints === 'number' && avgTaints > tfRules!.max_taints) {
          violations.push(`Cupping taints: ${avgTaints} exceeds limit (${tfRules!.max_taints})`)
        }
        if (typeof tfRules!.max_faults === 'number' && avgFaults > tfRules!.max_faults) {
          violations.push(`Cupping faults: ${avgFaults} exceeds limit (${tfRules!.max_faults})`)
        }
        if (typeof tfRules!.max_combined === 'number' && (avgTaints + avgFaults) > tfRules!.max_combined) {
          violations.push(`Cupping defects combined: ${avgTaints + avgFaults} exceeds limit (${tfRules!.max_combined})`)
        }
      }
    } else {
      // Fallback: use template-level max_taints_allowed / max_faults_allowed columns
      const maxTaintsAllowed = typeof template.max_taints_allowed === 'number' ? template.max_taints_allowed : null
      const maxFaultsAllowed = typeof template.max_faults_allowed === 'number' ? template.max_faults_allowed : null

      if (maxTaintsAllowed !== null && avgTaints > maxTaintsAllowed) {
        violations.push(`Cupping taints: ${avgTaints} exceeds limit (${maxTaintsAllowed})`)
      }
      if (maxFaultsAllowed !== null && avgFaults > maxFaultsAllowed) {
        violations.push(`Cupping faults: ${avgFaults} exceeds limit (${maxFaultsAllowed})`)
      }

      // If no taint rules exist at all but taints are detected, reject by default
      // (taints are serious cupping defects that should always trigger rejection)
      if (maxTaintsAllowed === null && avgTaints > 0) {
        violations.push(`Cupping taints detected: ${avgTaints} (no tolerance configured, rejecting by default)`)
      }
    }
  }

  return {
    approved: violations.length === 0,
    violations
  }
}

/**
 * Check if a quality spec has validation rules (a template with parameters)
 * Used to determine if manual decision should be allowed
 */
async function checkHasValidationRules(qualitySpecId: string | null): Promise<boolean> {
  if (!qualitySpecId) {
    return false
  }

  const { data: qualitySpec, error } = await supabaseAdmin
    .from('client_qualities')
    .select(`
      id,
      template:quality_templates(
        id,
        parameters
      )
    `)
    .eq('id', qualitySpecId)
    .single()

  if (error || !qualitySpec?.template) {
    return false
  }

  const template = qualitySpec.template as any
  const parameters = template.parameters

  // Check if there are any validation rules defined
  if (!parameters || typeof parameters !== 'object') {
    return false
  }

  // Check for cupping attributes, defect limits, screen sizes, moisture, quakers, or taint/fault rules
  const hasRules = Boolean(
    parameters.cupping_attributes ||
    parameters.defect_limits ||
    parameters.screen_sizes ||
    parameters.screen_size_requirements?.constraints?.length ||
    parameters.taint_fault_configuration?.rules ||
    parameters.moisture_min !== undefined ||
    parameters.moisture_max !== undefined ||
    parameters.max_quakers !== undefined
  )

  return hasRules
}
