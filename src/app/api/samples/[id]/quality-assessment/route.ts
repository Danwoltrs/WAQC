import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { evaluateQualityCompliance } from '@/lib/compliance'
import { computeContentLock } from '@/lib/sample-edit-permissions'
import { excludeCvaScores, excludeCvaSessions } from '@/lib/cupping-protocol-scope'
import { applyDecisionToGroup, mintGroupCertificates } from '@/lib/cupping/certificate-mint'
import { groupSampleIds, resolveLabSourceId } from '@/lib/sample-group'

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
 * automatically decides the whole contract group and mints one certificate per member.
 *
 * Lab data lives on the LAB UNIT: a contract sibling reads and writes its
 * group's single quality_assessments row (resolveLabSourceId), so grading
 * entered from any member of the group lands in one place.
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

    const labId = await resolveLabSourceId(supabase, sampleId)

    // Check if quality assessment already exists (on the lab unit)
    const { data: existingAssessment } = await supabase
      .from('quality_assessments')
      .select('id, green_bean_data, roast_data')
      .eq('sample_id', labId)
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

      // Invalidate cached certificate PDFs since assessment data changed
      invalidateGroupCertificatePdfs(supabase, sampleId)

      // Auto-certify if sample is in 'review' stage and green_bean_data was just saved
      if (green_bean_data && sample.workflow_stage === 'review' && sample.client_id) {
        const certResult = await autoCertifyIfReady(sampleId, labId, {
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
          sample_id: labId,
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

      // Invalidate cached certificate PDFs since assessment data changed
      invalidateGroupCertificatePdfs(supabase, sampleId)

      // Auto-certify if sample is in 'review' stage and green_bean_data was just saved
      if (green_bean_data && sample.workflow_stage === 'review' && sample.client_id) {
        const certResult = await autoCertifyIfReady(sampleId, labId, {
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
 * Every member of the group renders the same lab data, so a change to it
 * stales every member's cached certificate PDF, not just the one edited.
 * Fire-and-forget, as the single-sample call was.
 */
function invalidateGroupCertificatePdfs(supabase: any, sampleId: string): void {
  groupSampleIds(supabase, sampleId)
    .then((ids) => Promise.all((ids.length ? ids : [sampleId]).map((id) => invalidateCertificatePdf(supabase, id))))
    .catch(() => {})
}

/**
 * Auto-certify a sample when grading is saved and cupping was already finalized.
 * Runs compliance evaluation against the lab unit's data, applies the decision
 * to the whole contract group and mints one certificate per member.
 * Returns this sample's certificate info if created, null if not applicable.
 */
async function autoCertifyIfReady(
  sampleId: string,
  labId: string,
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
        .eq('sample_id', labId)
    ).limit(1)

    if (!cuppingScores || cuppingScores.length === 0) {
      return null // Cupping not done yet
    }

    // Check that the lab unit has no certificate already — if it does, the
    // group was decided and there is nothing to auto-certify.
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .eq('sample_id', labId)
      .maybeSingle()

    if (existingCert) {
      return null // Certificate already exists
    }

    // Find the cupping session to get assigned cupper IDs for compliance evaluation
    const { data: session } = await excludeCvaSessions(
      supabaseAdmin
        .from('cupping_sessions')
        .select('cupper_ids')
        .contains('sample_ids', [labId])
        .in('status', ['setup', 'active', 'review', 'completed'])
    )
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const assignedCupperIds = (session?.cupper_ids as string[]) || []

    // Run compliance evaluation with full data (cupping + grading)
    const complianceResult = await evaluateQualityCompliance(
      supabaseAdmin,
      labId,
      sample.quality_spec_id,
      assignedCupperIds
    )

    const decision = complianceResult.approved ? 'approved' : 'rejected'
    const isRejected = decision === 'rejected'
    const newWorkflowStage = isRejected ? 'rejected' : 'certified'

    // Decide the whole group — siblings never diverge from their lab unit.
    const { error: sampleUpdateError } = await applyDecisionToGroup(supabaseAdmin, labId, {
      status: decision,
      workflow_stage: newWorkflowStage,
    })

    if (sampleUpdateError) {
      console.error('[AutoCertify] Sample update failed:', sampleUpdateError)
      return null
    }

    // Push the decision to the shared sys shipment_samples row immediately.
    await writeDecisionToShipmentSamples(supabaseAdmin, labId, userId)

    // Validate tracking number
    if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
      console.error('[AutoCertify] Invalid tracking_number for sample', sampleId)
      return null
    }

    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    // One certificate per member, lab unit first, each issued to its own
    // client. Numbers come from the assign_certificate_number trigger.
    const group = await mintGroupCertificates(supabaseAdmin, labId, {
      issuedBy: userId,
      isRejected,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      violations: complianceResult.violations,
    })

    if (group.failed.length > 0) {
      console.error('[AutoCertify] Certificate creation failed:', group.failed)
    }
    const newCert = group.certificates[sampleId] ?? group.certificates[labId]
    if (!newCert) {
      return null
    }

    console.log(`[AutoCertify] Certificate ${newCert.certificate_number} created for sample ${sampleId} (${decision}); group minted ${group.minted.length}`)

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

    // Fetch quality assessment — from the lab unit, which is where a contract
    // sibling's grading lives.
    const labId = await resolveLabSourceId(supabase, sampleId)
    const { data: assessment, error: assessmentError } = await supabase
      .from('quality_assessments')
      .select('*')
      .eq('sample_id', labId)
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
