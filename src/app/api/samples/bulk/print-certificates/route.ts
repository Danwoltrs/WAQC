import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isInternalStaff } from '@/lib/auth/sample-access'
import { renderCertificateBundlePdfBuffer } from '@/lib/certificate-render'
import { MAX_PRINT_CERTIFICATES, planCertificatePrint } from '@/lib/certificate-print'
import { logCertificateDownload } from '@/lib/sample-events'
import { selectInChunks } from '@/lib/supabase-in-chunks'

/**
 * POST /api/samples/bulk/print-certificates
 * Body: { sample_ids: string[] }
 *
 * One PDF holding the certificate of every selected sample that has one, a page
 * each, in the order given: what "Print certificate" on the Samples page sends
 * to the printer. Built by the same renderer as a single certificate.
 *
 * A sample without a certificate is left out; how many is in `X-Skipped-Samples`.
 * When none has one the answer is 400 with the reason. Lab staff only.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isInternalStaff(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const raw = body?.sample_ids
    if (!Array.isArray(raw) || raw.length === 0 || raw.some((id) => typeof id !== 'string' || !id)) {
      return NextResponse.json({ error: 'sample_ids array is required' }, { status: 400 })
    }
    const sampleIds = [...new Set(raw as string[])]
    if (sampleIds.length > MAX_PRINT_CERTIFICATES) {
      return NextResponse.json(
        { error: `At most ${MAX_PRINT_CERTIFICATES} certificates can be printed at once` },
        { status: 400 },
      )
    }

    const samplesRes = await selectInChunks<{ id: string; deleted_at: string | null }>(sampleIds, (chunk) =>
      supabase.from('samples').select('id, deleted_at').in('id', chunk) as unknown as Promise<{
        data: Array<{ id: string; deleted_at: string | null }> | null
        error: unknown
      }>,
    )
    const certsRes = await selectInChunks<{ id: string; sample_id: string | null; voided_at: string | null }>(
      sampleIds,
      (chunk) =>
        (supabase as any).from('certificates').select('id, sample_id, voided_at').in('sample_id', chunk) as Promise<{
          data: Array<{ id: string; sample_id: string | null; voided_at: string | null }> | null
          error: unknown
        }>,
    )
    if (samplesRes.error || certsRes.error) {
      console.error('[print-certificates] lookup failed:', samplesRes.error || certsRes.error)
      return NextResponse.json({ error: 'Failed to load the selected samples' }, { status: 500 })
    }

    const plan = planCertificatePrint(sampleIds, samplesRes.data ?? [], certsRes.data ?? [])
    if (plan.print.length === 0) {
      return NextResponse.json(
        { error: 'None of the selected samples has a certificate yet', skipped: plan.skipped },
        { status: 400 },
      )
    }

    const { pdf, rendered, missing } = await renderCertificateBundlePdfBuffer(
      supabase,
      plan.print.map((p) => p.sampleId),
    )
    if (!pdf) {
      return NextResponse.json({ error: 'The certificates could not be generated' }, { status: 500 })
    }

    const certificateBySample = new Map(plan.print.map((p) => [p.sampleId, p.certificateId]))
    for (const sampleId of rendered) {
      await logCertificateDownload(supabase as any, {
        sampleId,
        certificateId: certificateBySample.get(sampleId) ?? null,
        actorUserId: user.id,
        channel: 'bulk',
        cached: false,
      })
    }

    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="certificates-${today}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Printed-Certificates': String(rendered.length),
        'X-Skipped-Samples': String(plan.skipped.length + missing.length),
      },
    })
  } catch (error) {
    console.error('[print-certificates] failed:', error)
    return NextResponse.json({ error: 'Failed to print the certificates' }, { status: 500 })
  }
}
