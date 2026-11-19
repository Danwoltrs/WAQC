import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { labWriteBlock } from '@/lib/auth/lab-scope'
import { invalidateCertificatePdf } from '@/lib/certificate-storage'
import { cleanContainerNumber, isOnStandby } from '@/lib/pre-certificate'
import { logSampleEvent } from '@/lib/sample-events'
import { shownCertificateNumber } from '@/lib/sample-reference'

/**
 * POST /api/certificates/[id]/finalize
 * Body: { container_nr: string }
 *
 * Make a pre-certificate final by adding its container. The certificate keeps
 * the number it was given on standby; the container is written on the sample;
 * who did it and when is recorded on the certificate and in the audit trail.
 * One container per pre-certificate.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isInternalStaff(supabase as any, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const container = cleanContainerNumber(body?.container_nr)
    if (!container) {
      return NextResponse.json({ error: 'Give the container number (letters and digits, 4 to 20)' }, { status: 400 })
    }

    // Read under the caller's own access: a certificate of a laboratory they
    // may not read is simply not found.
    const { data: certificate, error: certError } = await (supabase as any)
      .from('certificates')
      .select('id, certificate_number, sample_id, status, standby_at, finalized_at, voided_at')
      .eq('id', id)
      .maybeSingle()
    if (certError || !certificate || !certificate.sample_id) {
      return NextResponse.json({ error: 'Pre-certificate not found' }, { status: 404 })
    }
    if (certificate.voided_at || !isOnStandby(certificate)) {
      return NextResponse.json({ error: 'This certificate is not waiting on standby' }, { status: 409 })
    }

    // HQ looks at another laboratory, it does not finalize there.
    const otherLab = await labWriteBlock(supabase as any, user.id, certificate.sample_id)
    if (otherLab) return NextResponse.json({ error: otherLab }, { status: 403 })

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    ) as any

    // Only a certificate still waiting is taken: two people finalizing the same
    // one at once cannot both succeed.
    const finalizedAt = new Date().toISOString()
    const { data: finalized, error: finalizeError } = await admin
      .from('certificates')
      .update({
        status: 'issued',
        finalized_at: finalizedAt,
        finalized_by: user.id,
        finalized_container: container,
        pdf_url: null,
        updated_at: finalizedAt,
      })
      .eq('id', id)
      .is('finalized_at', null)
      .not('standby_at', 'is', null)
      .select('id, certificate_number, finalized_at')
      .maybeSingle()
    if (finalizeError) {
      console.error('[certificates/finalize] update failed:', finalizeError)
      return NextResponse.json({ error: 'Could not finalize the pre-certificate' }, { status: 500 })
    }
    if (!finalized) {
      return NextResponse.json({ error: 'This certificate is not waiting on standby' }, { status: 409 })
    }

    const { error: sampleError } = await admin
      .from('samples')
      .update({ container_nr: container })
      .eq('id', certificate.sample_id)
    if (sampleError) {
      // The certificate must not be final without its container on the lot: put it back.
      console.error('[certificates/finalize] container not saved, undoing:', sampleError)
      await admin
        .from('certificates')
        .update({ status: 'draft', finalized_at: null, finalized_by: null, finalized_container: null })
        .eq('id', id)
      return NextResponse.json({ error: 'Could not save the container: nothing was finalized' }, { status: 500 })
    }

    await logSampleEvent(admin, {
      sample_id: certificate.sample_id,
      certificate_id: id,
      event_type: 'certificate_finalized',
      actor_user_id: user.id,
      metadata: { certificate_number: certificate.certificate_number ?? null, container_nr: container },
    })
    await invalidateCertificatePdf(admin, certificate.sample_id).catch(() => {})

    return NextResponse.json({
      success: true,
      certificate: {
        id,
        certificate_number: shownCertificateNumber(finalized.certificate_number),
        finalized_at: finalized.finalized_at,
        container_nr: container,
      },
    })
  } catch (error) {
    console.error('Error in POST /api/certificates/[id]/finalize:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
