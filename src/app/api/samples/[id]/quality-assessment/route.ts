import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { evaluateQualityCompliance } from '@/lib/compliance'
import { computeContentLock } from '@/lib/sample-edit-permissions'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'

// Admin client bypasses RLS for sample status updates and certificate creation
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/samples/[id]/quality-assessment
 * Create or update quality assessment for a sample.
 * When green_bean_data is saved and the sample is in 'review' stage (cupping already finalized),
 * automatically creates certificates for the mother sample and all sub-contracts.
 * Body: { green_bean_data?: object, roast_data?: object }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: sampleId } = await params
    const body = await request.json()
    const { green_bean_data, roast_data, clean_cup, uniform_cup, cupping_comments, grading_comments } = body

    // Verify sample exists (include workflow_stage for auto-certification check
    // and lock fields for the content-lock check)
    const { data: sample, error: sampleError } = await (supabase as any)
      .from('samples')
      .select('id, tracking_number, workflow_stage, client_id, quality_spec_id, locked, scanned_at, certificate_generated_at')
      .eq('id', sampleId)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Quality data (green bean / roast analysis) freezes once the content lock
    // applies (7 days after certificate generation, or after OCR scan lock).
    const assessmentLock = computeContentLock(sample)
    if (assessmentLock.contentLocked) {
      return NextResponse.json(
        { error: `Quality data is locked and cannot be edited. ${assessmentLock.message}` },
        { status: 423 }
      )
    }

    // Check if quality assessment already exists
    const { data: existingAssessment } = await supabase
      .from('quality_assessments')
      .select('id, green_bean_data, roast_data')
      .eq('sample_id', sampleId)
      .single()

    if (existingAssessment) {
      // Update existing assessment - merge data
      const updatedData: any = {
        updated_at: new Date().toISOString(),
      }

      if (green_bean_data) {
        // Merge with existing green_bean_data
        updatedData.green_bean_data = {
          ...(existingAssessment.green_bean_data as object || {}),
          ...green_bean_data,
        }
      }

      if (roast_data) {
        // Merge with existing roast_data
        updatedData.roast_data = {
          ...(existingAssessment.roast_data as object || {}),
          ...roast_data,
        }
      }

      // Update cup status if provided (boolean fields)
      if (clean_cup !== undefined) updatedData.clean_cup = clean_cup
      if (uniform_cup !== undefined) updatedData.uniform_cup = uniform_cup
      if (cupping_comments !== undefined) updatedData.cupping_comments = cupping_comments
      if (grading_comments !== undefined) updatedData.grading_comments = grading_comments

      const { error: updateError } = await supabase
        .from('quality_assessments')
        .update(updatedData)
        .eq('id', existingAssessment.id)

      if (updateError) {
        console.error('Failed to update quality assessment:', updateError)
        return NextResponse.json(
          { error: 'Failed to update quality assessment' },
          { status: 500 }
        )
      }

      // Invalidate cached certificate PDF since assessment data changed
      invalidateCertificatePdf(supabase, sampleId).catch(() => {})

      // Auto-certify if sample is in 'review' stage and green_bean_data was just saved
      if (green_bean_data && sample.workflow_stage === 'review' && sample.client_id) {
        const certResult = await autoCertifyIfReady(sampleId, {
          ...sample,
          client_id: sample.client_id,
        }, user.id)
        if (certResult) {
          return NextResponse.json({
            success: true,
            message: 'Quality assessment updated and certificate created',
            assessment_id: existingAssessment.id,
            certificate: certResult,
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Quality assessment updated successfully',
        assessment_id: existingAssessment.id,
      })
    } else {
      // Create new assessment
      const { data: newAssessment, error: insertError } = await supabase
        .from('quality_assessments')
        .insert({
          sample_id: sampleId,
          assessor_id: user.id,
          green_bean_data: green_bean_data || null,
          roast_data: roast_data || null,
        })
        .select('id')
        .single()

      if (insertError || !newAssessment) {
        console.error('Failed to create quality assessment:', insertError)
        return NextResponse.json(
          { error: 'Failed to create quality assessment' },
          { status: 500 }
        )
      }

      // Invalidate cached certificate PDF since assessment data changed
      invalidateCertificatePdf(supabase, sampleId).catch(() => {})

      // Auto-certify if sample is in 'review' stage and green_bean_data was just saved
      if (green_bean_data && sample.workflow_stage === 'review' && sample.client_id) {
        const certResult = await autoCertifyIfReady(sampleId, {
          ...sample,
          client_id: sample.client_id,
        }, user.id)
        if (certResult) {
          return NextResponse.json({
            success: true,
            message: 'Quality assessment created and certificate generated',
            assessment_id: newAssessment.id,
            certificate: certResult,
          })
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Quality assessment created successfully',
        assessment_id: newAssessment.id,
      })
    }
  } catch (error: any) {
    console.error('Error managing quality assessment:', error)
    return NextResponse.json(
      {
        error: 'Failed to manage quality assessment',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * Auto-certify a sample when grading is saved and cupping was already finalized.
 * Runs compliance evaluation and creates certificates for mother + sub-contracts.
 * Returns the certificate info if created, null if not applicable.
 */
async function autoCertifyIfReady(
  sampleId: string,
  sample: { id: string; tracking_number: string; client_id: string; quality_spec_id: string | null },
  userId: string
) {
  try {
    // Check that COMMODITY cupping scores exist (cupping was already
    // finalized). A CVA row is not a commodity assessment and must not stand in
    // for one here.
    const { data: cuppingScores } = await excludeCvaScores(
      supabaseAdmin
        .from('cupping_scores')
        .select('id')
        .eq('sample_id', sampleId)
    ).limit(1)

    if (!cuppingScores || cuppingScores.length === 0) {
      return null // Cupping not done yet
    }

    // Check that no certificate exists already
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .eq('sample_id', sampleId)
      .is('sample_contract_id', null)
      .maybeSingle()

    if (existingCert) {
      return null // Certificate already exists
    }

    // Find the cupping session to get assigned cupper IDs for compliance evaluation
    const { data: session } = await excludeCvaSessions(
      supabaseAdmin
        .from('cupping_sessions')
        .select('cupper_ids')
        .contains('sample_ids', [sampleId])
        .in('status', ['setup', 'active', 'review', 'completed'])
    )
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const assignedCupperIds = (session?.cupper_ids as string[]) || []

    // Run compliance evaluation with full data (cupping + grading)
    const complianceResult = await evaluateQualityCompliance(
      supabaseAdmin,
      sampleId,
      sample.quality_spec_id,
      assignedCupperIds
    )

    const decision = complianceResult.approved ? 'approved' : 'rejected'
    const isRejected = decision === 'rejected'
    const newWorkflowStage = isRejected ? 'rejected' : 'certified'

    // Update sample status
    const { error: sampleUpdateError } = await supabaseAdmin
      .from('samples')
      .update({
        status: decision,
        workflow_stage: newWorkflowStage,
        updated_at: new Date().toISOString()
      })
      .eq('id', sampleId)

    if (sampleUpdateError) {
      console.error('[AutoCertify] Sample update failed:', sampleUpdateError)
      return null
    }

    // Push the decision to the shared sys shipment_samples row immediately.
    await writeDecisionToShipmentSamples(supabaseAdmin, sampleId, userId)

    // Validate tracking number
    if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
      console.error('[AutoCertify] Invalid tracking_number for sample', sampleId)
      return null
    }

    // Get client info for issued_to (now from companies)
    const { data: client } = await (supabaseAdmin as any)
      .from('companies')
      .select('name, fantasy_name')
      .eq('id', sample.client_id)
      .single()

    const issuedTo = client?.fantasy_name || client?.name || 'Unknown Client'

    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    // Create mother certificate
    const { data: newCert, error: certError } = await supabaseAdmin
      .from('certificates')
      .insert({
        sample_id: sampleId,
        certificate_number: null,
        issued_to: issuedTo,
        issued_by: userId,
        status: 'issued',
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        is_rejected: isRejected,
        compliance_violations: complianceResult.violations.length > 0
          ? complianceResult.violations
          : null,
      })
      .select('id, certificate_number, created_at, is_rejected')
      .single()

    if (certError) {
      console.error('[AutoCertify] Certificate creation failed:', certError)
      return null
    }

    console.log(`[AutoCertify] Certificate ${newCert.certificate_number} created for sample ${sampleId} (${decision})`)

    // Create certificates for sub-contracts
    try {
      const { data: subContracts } = await supabaseAdmin
        .from('sample_contracts')
        .select('id, tracking_number, client_id')
        .eq('sample_id', sampleId)
        .order('sort_order', { ascending: true })

      if (subContracts && subContracts.length > 0) {
        const motherIssuedTo = issuedTo

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
                sample_id: sampleId,
                sample_contract_id: sc.id,
                certificate_number: null,
                issued_to: subIssuedTo,
                issued_by: userId,
                status: 'issued',
                valid_from: validFrom.toISOString(),
                valid_until: validUntil.toISOString(),
                is_rejected: isRejected,
                compliance_violations: complianceResult.violations.length > 0
                  ? complianceResult.violations
                  : null,
              })
          }
        }
      }
    } catch (subContractErr) {
      console.error('[AutoCertify] Sub-contract certificates error:', subContractErr)
      // Non-fatal: mother certificate was already created
    }

    return {
      id: newCert.id,
      certificate_number: newCert.certificate_number,
      decision,
      violations: complianceResult.violations,
    }
  } catch (error) {
    console.error('[AutoCertify] Error:', error)
    return null
  }
}

/**
 * GET /api/samples/[id]/quality-assessment
 * Get quality assessment for a sample
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: sampleId } = await params

    // Fetch quality assessment
    const { data: assessment, error: assessmentError } = await supabase
      .from('quality_assessments')
      .select('*')
      .eq('sample_id', sampleId)
      .single()

    if (assessmentError && assessmentError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is okay
      console.error('Failed to fetch quality assessment:', assessmentError)
      return NextResponse.json(
        { error: 'Failed to fetch quality assessment' },
        { status: 500 }
      )
    }

    if (!assessment) {
      return NextResponse.json(
        { assessment: null, message: 'No quality assessment found' },
        { status: 200 }
      )
    }

    return NextResponse.json({ assessment })
  } catch (error: any) {
    console.error('Error fetching quality assessment:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch quality assessment',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
