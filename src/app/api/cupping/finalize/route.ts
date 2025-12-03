import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
  screen_sizes?: Record<string, { min_percent?: number; max_percent?: number }>
}

/**
 * POST /api/cupping/finalize
 * Finalize cupping scores for a session:
 * 1. Auto-determine approval/rejection based on quality specs
 * 2. Update session status to 'completed'
 * 3. Update sample workflow_stage to 'certified' or 'rejected'
 * 4. Create certificate record with tracking_number (R- prefix if rejected)
 *
 * Body: {
 *   session_id: string,
 *   sample_id: string,
 *   notes?: string
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
    const { session_id, sample_id, notes } = body

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

    // Get the sample with quality spec info and current workflow stage
    const { data: sample, error: sampleError } = await supabaseAdmin
      .from('samples')
      .select('id, tracking_number, client_id, workflow_stage, status, quality_spec_id')
      .eq('id', sample_id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Auto-determine approval/rejection based on quality specifications
    const complianceResult = await evaluateQualityCompliance(
      sample_id,
      sample.quality_spec_id
    )

    const decision = complianceResult.approved ? 'approved' : 'rejected'

    // Determine workflow_stage based on decision
    const newWorkflowStage = decision === 'approved' ? 'certified' : 'rejected'

    // Get current workflow stage to handle transitions correctly
    // Valid transitions: cupping → review → certified/rejected
    // We may need to transition through 'review' first
    const currentWorkflowStage = sample.workflow_stage

    // If coming from cupping, we need to go through review first
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

    // Now update to final status and workflow_stage
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

    // Create certificate (for both approved and rejected)
    let certificate = null

    // Check if certificate already exists
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id, certificate_number')
      .eq('sample_id', sample_id)
      .single()

    if (!existingCert) {
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
            auto_determined: true,
            finalized_at: new Date().toISOString()
          },
          laboratory_id: session.laboratory_id
        })
    } catch (auditError) {
      console.error('Error logging audit:', auditError)
    }

    return NextResponse.json({
      success: true,
      decision,
      message: decision === 'approved'
        ? `Sample approved - Certificate ${certificate?.certificate_number || sample.tracking_number} generated`
        : `Sample rejected - Certificate ${certificate?.certificate_number || 'R-' + sample.tracking_number} generated`,
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
  qualitySpecId: string | null
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

  // Fetch aggregated cupping scores for this sample
  const { data: cuppingScores } = await supabaseAdmin
    .from('cupping_scores')
    .select('scores, defects')
    .eq('sample_id', sampleId)

  // Fetch grading data (green bean analysis)
  const { data: qualityAssessment } = await supabaseAdmin
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // 1. Check cupping attributes against thresholds
  if (cuppingScores && cuppingScores.length > 0 && parameters.cupping_attributes) {
    // Calculate average scores across all cuppers
    const avgScores: Record<string, number> = {}
    const scoreCounts: Record<string, number> = {}

    for (const score of cuppingScores) {
      if (score.scores && typeof score.scores === 'object') {
        for (const [attr, value] of Object.entries(score.scores as Record<string, number>)) {
          if (typeof value === 'number') {
            avgScores[attr] = (avgScores[attr] || 0) + value
            scoreCounts[attr] = (scoreCounts[attr] || 0) + 1
          }
        }
      }
    }

    // Calculate averages and check against thresholds
    for (const [attr, total] of Object.entries(avgScores)) {
      const avg = total / (scoreCounts[attr] || 1)
      const limits = parameters.cupping_attributes[attr]

      if (limits) {
        if (limits.min !== undefined && avg < limits.min) {
          violations.push(`${attr}: ${avg.toFixed(2)} is below minimum (${limits.min})`)
        }
        if (limits.max !== undefined && avg > limits.max) {
          violations.push(`${attr}: ${avg.toFixed(2)} is above maximum (${limits.max})`)
        }
      }
    }
  }

  // 2. Check defect intensity levels against per-defect thresholds
  if (cuppingScores && parameters.defect_limits) {
    for (const score of cuppingScores) {
      if (score.defects && typeof score.defects === 'object') {
        const defects = score.defects as any

        // Check taints with levels
        if (defects.taints_with_levels && Array.isArray(defects.taints_with_levels)) {
          for (const taint of defects.taints_with_levels) {
            const defectName = taint.name?.toLowerCase()
            const defectLevel = taint.level || 0
            const limit = parameters.defect_limits[defectName]

            if (limit?.max_level !== undefined && defectLevel > limit.max_level) {
              violations.push(`Taint "${taint.name}": Level ${defectLevel} exceeds maximum (${limit.max_level})`)
            }
          }
        }

        // Check faults with levels
        if (defects.faults_with_levels && Array.isArray(defects.faults_with_levels)) {
          for (const fault of defects.faults_with_levels) {
            const defectName = fault.name?.toLowerCase()
            const defectLevel = fault.level || 0
            const limit = parameters.defect_limits[defectName]

            if (limit?.max_level !== undefined && defectLevel > limit.max_level) {
              violations.push(`Fault "${fault.name}": Level ${defectLevel} exceeds maximum (${limit.max_level})`)
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
      // Check primary defect count
      const primaryCount = defects.total_primary || 0
      if (template.defect_thresholds_primary !== null &&
          primaryCount > template.defect_thresholds_primary) {
        violations.push(`Primary defects: ${primaryCount} exceeds limit (${template.defect_thresholds_primary})`)
      }

      // Check secondary defect count
      const secondaryCount = defects.total_secondary || 0
      if (template.defect_thresholds_secondary !== null &&
          secondaryCount > template.defect_thresholds_secondary) {
        violations.push(`Secondary defects: ${secondaryCount} exceeds limit (${template.defect_thresholds_secondary})`)
      }

      // Check total defect count (primary + secondary)
      const totalCount = primaryCount + secondaryCount
      // Note: total threshold may be in parameters or as separate field
      const totalThreshold = (parameters as any).defect_thresholds_total
      if (totalThreshold !== undefined && totalCount > totalThreshold) {
        violations.push(`Total defects: ${totalCount} exceeds limit (${totalThreshold})`)
      }
    }

    // Check taint/fault counts
    if (greenBean.taints_count !== undefined && template.max_taints_allowed !== null) {
      if (greenBean.taints_count > template.max_taints_allowed) {
        violations.push(`Taints: ${greenBean.taints_count} exceeds limit (${template.max_taints_allowed})`)
      }
    }

    if (greenBean.faults_count !== undefined && template.max_faults_allowed !== null) {
      if (greenBean.faults_count > template.max_faults_allowed) {
        violations.push(`Faults: ${greenBean.faults_count} exceeds limit (${template.max_faults_allowed})`)
      }
    }

    // 6. Check screen size distribution
    if (greenBean.screen_sizes && template.screen_size_requirements) {
      const screenSizes = greenBean.screen_sizes as Record<string, number>
      const requirements = template.screen_size_requirements as Record<string, { min_percent?: number; max_percent?: number }>

      for (const [size, req] of Object.entries(requirements)) {
        const actualPercent = screenSizes[size] || 0

        if (req.min_percent !== undefined && actualPercent < req.min_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% is below minimum (${req.min_percent}%)`)
        }
        if (req.max_percent !== undefined && actualPercent > req.max_percent) {
          violations.push(`Screen ${size}: ${actualPercent.toFixed(1)}% exceeds maximum (${req.max_percent}%)`)
        }
      }
    }
  }

  return {
    approved: violations.length === 0,
    violations
  }
}
