import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { computeContentLock } from '@/lib/sample-edit-permissions'
import { certifyAfterGrading } from '@/lib/cupping/certify-after-grading'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { checkHasValidationRules } from '@/lib/compliance'
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
 *
 * A save only SAVES. The grading is finished when a lab user says so:
 * `finalize_grading: true` stamps quality_assessments.grading_finalized_at,
 * and if the cupping was already finalized (workflow_stage 'review') the
 * whole contract group is decided and one certificate minted per member.
 * Until 2026-10-06 any save of green_bean_data on a lot in Review certified
 * it, so a screen-size-only save issued SAK-011933/26 with no defects.
 *
 * Lab data lives on the LAB UNIT: a contract sibling reads and writes its
 * group's single quality_assessments row (resolveLabSourceId), so grading
 * entered from any member of the group lands in one place.
 * A spec WITHOUT validation rules is decided by hand: finalizing such a lot
 * in Review needs `manual_decision`, and without one the grading is saved,
 * left unfinalized, and the answer says `needs_decision` so the page asks.
 *
 * Body: { green_bean_data?: object, roast_data?: object, finalize_grading?: boolean,
 *         manual_decision?: 'approved' | 'rejected', seller_comment?: string }
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
    const finalizeGrading = body.finalize_grading === true
    const manualDecision: 'approved' | 'rejected' | null =
      body.manual_decision === 'approved' || body.manual_decision === 'rejected' ? body.manual_decision : null
    const sellerComment: string | null =
      typeof body.seller_comment === 'string' && body.seller_comment.trim() ? body.seller_comment.trim() : null

    // Finalizing decides the lot through the service role, so being signed in
    // is not enough: any internal lab user may finalize, portal roles may not.
    if (finalizeGrading && !(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Only lab staff can finalize grading' }, { status: 403 })
    }

    // Verify sample exists (include workflow_stage for the certification check
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

    let assessmentId: string

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
      assessmentId = existingAssessment.id
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
      assessmentId = newAssessment.id
    }

    // Invalidate cached certificate PDFs since assessment data changed
    invalidateGroupCertificatePdfs(supabase, sampleId)

    if (!finalizeGrading) {
      return NextResponse.json({
        success: true,
        message: 'Grading saved',
        assessment_id: assessmentId,
      })
    }

    // There has to be a grading to finalize.
    const hasGrading = !!green_bean_data || !!existingAssessment?.green_bean_data
    if (!hasGrading) {
      return NextResponse.json(
        { error: 'Nothing has been graded yet, so there is nothing to finalize' },
        { status: 400 }
      )
    }

    const decidesNow = sample.workflow_stage === 'review' && !!sample.client_id
    if (decidesNow && !manualDecision && !(await checkHasValidationRules(supabaseAdmin as any, sample.quality_spec_id))) {
      return NextResponse.json({
        success: true,
        needs_decision: true,
        message: 'This quality has no specification rules: choose Approve or Reject',
        assessment_id: assessmentId,
      })
    }

    const { error: finalizeError } = await supabaseAdmin
      .from('quality_assessments')
      .update({ grading_finalized_at: new Date().toISOString(), grading_finalized_by: user.id } as any)
      .eq('id', assessmentId)
    if (finalizeError) {
      console.error('Failed to finalize grading:', finalizeError)
      return NextResponse.json({ error: 'Grading was saved but could not be finalized' }, { status: 500 })
    }

    // Cupping already finalized: this is the moment the lot is decided.
    if (decidesNow) {
      const certificate = await certifyAfterGrading(supabaseAdmin, {
        sampleId,
        labId,
        sample,
        userId: user.id,
        manualDecision,
        sellerComment,
      })
      if (certificate) {
        return NextResponse.json({
          success: true,
          grading_finalized: true,
          message: 'Grading finalized and certificate created',
          assessment_id: assessmentId,
          certificate,
        })
      }
    }

    return NextResponse.json({
      success: true,
      grading_finalized: true,
      // The cupping half is still open: its finalize issues the certificate.
      cupping_pending: sample.workflow_stage !== 'review',
      message: sample.workflow_stage === 'review'
        ? 'Grading finalized'
        : 'Grading finalized. The certificate is issued when the cupping is finalized.',
      assessment_id: assessmentId,
    })
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
