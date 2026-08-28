import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { groupSampleIds } from '@/lib/sample-group'

// Admin client bypasses RLS for sample status updates
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * PATCH /api/certificates/[id]/override
 * Override a certificate's approval/rejection status with a required comment.
 *
 * The decision belongs to the whole contract group (one physical sample, N
 * `samples` rows sharing a lab unit — see `sample-group.ts`): every member's
 * sample status and certificate flip together, so siblings never diverge.
 */
export async function PATCH(
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

    const { id: certificateId } = await params
    const body = await request.json()
    const { status, comment } = body as { status?: string; comment?: string }

    // Validate inputs
    if (!status || (status !== 'approved' && status !== 'rejected')) {
      return NextResponse.json(
        { error: 'Status must be "approved" or "rejected"' },
        { status: 400 }
      )
    }
    if (!comment || comment.trim().length === 0) {
      return NextResponse.json(
        { error: 'Override comment is required' },
        { status: 400 }
      )
    }

    // Fetch the certificate with its sample
    const { data: certificate, error: certError } = await supabase
      .from('certificates')
      .select('id, certificate_number, sample_id, is_rejected')
      .eq('id', certificateId)
      .single()

    if (certError || !certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }

    const isRejecting = status === 'rejected'

    // Every sample in this certificate's contract group (lab unit + siblings).
    const groupIds = certificate.sample_id ? await groupSampleIds(supabaseAdmin, certificate.sample_id) : []

    // Derive the base tracking number (strip existing R- prefix if present)
    const baseNumber = certificate.certificate_number.startsWith('R-')
      ? certificate.certificate_number.slice(2)
      : certificate.certificate_number
    const newCertNumber = isRejecting ? `R-${baseNumber}` : baseNumber

    // Update the samples FIRST (source of truth) — the whole group in one
    // write. If this fails, we return before touching the certificate so the
    // cert and sample can never diverge (the old order flipped the cert, then
    // failed the sample update, leaving the cert showing "approved" while the
    // sample stayed "rejected").
    if (groupIds.length > 0) {
      const { error: sampleError } = await supabaseAdmin
        .from('samples')
        .update({
          status: isRejecting ? 'rejected' : 'approved',
          workflow_stage: isRejecting ? 'rejected' : 'certified',
        })
        .in('id', groupIds)

      if (sampleError) {
        console.error('[Override] Sample update failed:', sampleError)
        return NextResponse.json(
          { error: 'Failed to update sample status', details: sampleError.message },
          { status: 500 }
        )
      }
    }

    // Update the certificate to match the sample.
    const updateData: Record<string, unknown> = {
      is_rejected: isRejecting,
      certificate_number: newCertNumber,
      override_comment: comment.trim(),
    }
    // Clear compliance_violations when overriding to approved
    if (!isRejecting) {
      updateData.compliance_violations = null
    }

    const { error: updateError } = await supabase
      .from('certificates')
      .update(updateData)
      .eq('id', certificateId)

    if (updateError) {
      console.error('[Override] Certificate update failed:', updateError)
      return NextResponse.json(
        { error: 'Failed to update certificate', details: updateError.message },
        { status: 500 }
      )
    }

    // Group-keyed follow-ups (writeback, sibling certs, PDF invalidation).
    if (certificate.sample_id && groupIds.length > 0) {
      // Reflect the override on the shared sys shipment_samples rows immediately
      // (the write-back resolves the group itself, one call covers every contract).
      await writeDecisionToShipmentSamples(supabaseAdmin, certificate.sample_id, user.id)

      // Update the sibling certificates (same physical sample, other contracts)
      const { data: siblingCerts } = await supabase
        .from('certificates')
        .select('id, certificate_number')
        .in('sample_id', groupIds)
        .neq('id', certificateId)

      if (siblingCerts && siblingCerts.length > 0) {
        for (const sc of siblingCerts) {
          const scBase = sc.certificate_number.startsWith('R-')
            ? sc.certificate_number.slice(2)
            : sc.certificate_number
          const scNewNumber = isRejecting ? `R-${scBase}` : scBase

          await supabase
            .from('certificates')
            .update({
              is_rejected: isRejecting,
              certificate_number: scNewNumber,
              override_comment: comment.trim(),
              ...(isRejecting ? {} : { compliance_violations: null }),
            })
            .eq('id', sc.id)
        }
      }

      // Invalidate cached PDFs so they regenerate with the new status
      for (const sid of groupIds) await invalidateCertificatePdf(supabaseAdmin, sid)
    }

    return NextResponse.json({
      message: `Certificate overridden to ${status}`,
      certificate_number: newCertNumber,
    })
  } catch (error) {
    console.error('Error in PATCH /api/certificates/[id]/override:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
