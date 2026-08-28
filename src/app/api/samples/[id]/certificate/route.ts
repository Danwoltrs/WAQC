import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
import { applyDecisionToGroup, mintGroupCertificates } from '@/lib/cupping/certificate-mint'
import { resolveLabSourceId } from '@/lib/sample-group'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { resolveSampleId } from '@/lib/sample-utils'
import { uploadCertificatePdf, getCachedCertificatePdf } from '@/lib/certificate-storage'
import { buildCertificateFilename } from '@/lib/certificate-filename'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * GET /api/samples/[id]/certificate
 * Generate and return a PDF quality certificate for a sample
 * Supports both UUID and tracking number slug (e.g., SAK-048524_25)
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
      console.error('[Certificate GET] Auth error:', authError?.message || 'No user found')
      return NextResponse.json({ error: 'Unauthorized', details: authError?.message }, { status: 401 })
    }
    console.log('[Certificate GET] Authenticated user:', user.id)

    const { id: idOrSlug } = await params

    // Resolve to UUID if tracking number slug was provided
    const { id: resolvedId, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!resolvedId) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }
    // A pre-2026-08-28 link may still carry ?contract_id=<sample_contracts id>.
    // That sub-contract is a sample of its own now; from here on it is a plain
    // sample like any other.
    const id = await resolveLegacyContractId(supabase, resolvedId, request.nextUrl.searchParams.get('contract_id'))
    console.log('[Certificate] Generating PDF for sample:', id)

    // NOTE: the certificate always shows the CURRENT sys.wolthers seller/buyer
    // references via read-through in getCertificateData() — no write is performed on
    // this read path, so any authenticated viewer gets the right numbers without
    // triggering (editor-only) database writes.

    // Bypass the stored-PDF cache when developing (so template/layout code
    // changes are reflected immediately) or when explicitly asked via ?nocache=1.
    // The fresh render still re-caches below, updating the shared cache.
    const bypassCache =
      process.env.NODE_ENV !== 'production' ||
      request.nextUrl.searchParams.get('nocache') === '1'

    // Buyer reference for the filename — the sample's own (a contract sibling
    // carries its own buyer_contract_nr). Buyers (e.g. Ahold) ask for their
    // contract reference in the filename alongside the cert number.
    const { data: sRow } = await supabase
      .from('samples')
      .select('buyer_contract_nr')
      .eq('id', id)
      .maybeSingle()
    const buyerRef: string | null = (sRow as any)?.buyer_contract_nr ?? null

    // Check for cached PDF first — one certificate per sample.
    const { data: certificate } = await supabase
      .from('certificates')
      .select('id, certificate_number, pdf_url')
      .eq('sample_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (certificate?.pdf_url && !bypassCache) {
      console.log('[Certificate] Serving cached PDF:', certificate.pdf_url)
      const cachedBuffer = await getCachedCertificatePdf(supabase, certificate.pdf_url)
      if (cachedBuffer) {
        const filename = buildCertificateFilename(certificate.certificate_number, buyerRef)
        return new NextResponse(new Uint8Array(cachedBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${filename}"`,
            // no-cache so the browser revalidates instead of holding a stale
            // cert PDF (cert content changes when sample/template data is edited).
            'Cache-Control': 'no-cache',
          },
        })
      }
      console.log('[Certificate] Cached PDF not found in storage, regenerating...')
    }

    // Get certificate data
    const certificateData = await getCertificateData(id)
    if (!certificateData) {
      console.error('[Certificate] No certificate data found for sample:', id)
      return NextResponse.json({ error: 'Sample not found or no data available' }, { status: 404 })
    }
    console.log('[Certificate] Got certificate data:', {
      sampleId: certificateData.sample?.id,
      hasCupping: !!certificateData.cuppingData,
      hasGreenBean: !!certificateData.greenBeanAnalysis,
      hasCertificate: !!certificateData.certificate,
    })

    // Load Wolthers logo from public directory
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('Error loading Wolthers logo:', err)
    }

    // Load client logo from Supabase Storage if available
    let clientLogoBase64: string | undefined
    if (certificateData.client?.logo_url) {
      try {
        const logoUrl = certificateData.client.logo_url
        // If it's a full URL (already signed or public)
        const response = await fetch(logoUrl)
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const contentType = response.headers.get('content-type') || 'image/png'
          clientLogoBase64 = `data:${contentType};base64,${base64}`
        }
      } catch (err) {
        console.error('Error loading client logo:', err)
      }
    }

    // Load country flag from public directory
    let flagBase64: string | undefined
    const countryCode = getCountryCodeFromOrigin(certificateData.sample.origin)
    if (countryCode) {
      try {
        const flagRelativePath = getFlagPath(countryCode)
        const flagPath = path.join(process.cwd(), 'public', flagRelativePath)
        const flagBuffer = fs.readFileSync(flagPath)
        flagBase64 = `data:image/png;base64,${flagBuffer.toString('base64')}`
      } catch (err) {
        console.error('Error loading flag:', err)
      }
    }

    // Render PDF to buffer
    console.log('[Certificate] Rendering PDF...')
    const certificateElement = React.createElement(QualityCertificate, {
      data: certificateData,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
    })
    const pdfBuffer = await renderToBuffer(certificateElement as any)
    console.log('[Certificate] PDF rendered, buffer size:', pdfBuffer.length)

    // Cache the generated PDF in storage
    if (certificate?.id) {
      uploadCertificatePdf(supabase, id, certificate.id, Buffer.from(pdfBuffer))
        .then((path) => path && console.log('[Certificate] Cached PDF at:', path))
        .catch((err) => console.error('[Certificate] Cache upload failed:', err))
    }

    // Generate filename - buyer reference (when present) + sanitized certificate number
    const certificateNumber = certificateData.certificate?.certificate_number || certificateData.sample.tracking_number
    const filename = buildCertificateFilename(certificateNumber, buyerRef)

    // Return PDF response - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/samples/[id]/certificate:', error)
    return NextResponse.json({
      error: 'Failed to generate certificate',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * POST /api/samples/[id]/certificate
 * Generate a certificate and save it to the database (creates certificate record if not exists)
 * Supports both UUID and tracking number slug (e.g., SAK-048524_25)
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

    const { id: idOrSlug } = await params

    // Resolve to UUID if tracking number slug was provided
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }

    // Check if sample exists with workflow stage and client info
    const { data: sample, error: sampleError } = await supabase
      .from('samples')
      .select('id, tracking_number, client_id, origin, workflow_stage, status, quality_spec_id')
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Cupping and grading live on the lab unit; a contract sibling checks its
    // group's data, not its own (empty) rows.
    const labId = await resolveLabSourceId(supabase, id)

    // Validate tracking number before proceeding
    if (!sample.tracking_number || sample.tracking_number === 'null' || sample.tracking_number === '') {
      console.error('Cannot create certificate: invalid tracking_number for sample', id, sample.tracking_number)
      return NextResponse.json({
        error: 'Cannot generate certificate - sample has invalid tracking number',
        details: 'Please contact an administrator to fix the sample tracking number.'
      }, { status: 400 })
    }

    // For samples in 'review' stage, check if both cupping AND grading are complete
    // This handles the case where the finalize flow had a bug and didn't create the certificate
    let isRejected = sample.workflow_stage === 'rejected'

    if (sample.workflow_stage === 'review') {
      // Check for cupping scores
      const { data: cuppingScores } = await supabase
        .from('cupping_scores')
        .select('id')
        .eq('sample_id', labId)
        .limit(1)

      // Check for grading data (quality_assessments with green_bean_data)
      const { data: gradingData } = await supabase
        .from('quality_assessments')
        .select('id, green_bean_data')
        .eq('sample_id', labId)
        .not('green_bean_data', 'is', null)
        .limit(1)

      const hasCupping = cuppingScores && cuppingScores.length > 0
      const hasGrading = gradingData && gradingData.length > 0

      if (!hasCupping || !hasGrading) {
        return NextResponse.json({
          error: 'Cannot generate certificate',
          details: `Sample must have both cupping scores and grading data. ` +
            `Cupping: ${hasCupping ? 'complete' : 'missing'}, ` +
            `Grading: ${hasGrading ? 'complete' : 'missing'}.`
        }, { status: 400 })
      }

      // For samples in 'review' stage with complete data, default to approved
      // This is a recovery mechanism for samples that were stuck due to bugs
      // The proper compliance check happens through the cupping finalize flow
      isRejected = false

      // Update workflow_stage to certified — for the whole contract group,
      // since siblings never diverge from their lab unit.
      await applyDecisionToGroup(supabase, id, { workflow_stage: 'certified', status: 'approved' })

      // Reflect the recovered approval on the shared sys shipment_samples row
      // (service role — the shared table is RLS-guarded for the user client).
      const ssAdmin = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      await writeDecisionToShipmentSamples(ssAdmin, id, user.id)

    } else if (sample.workflow_stage !== 'certified' && sample.workflow_stage !== 'rejected') {
      return NextResponse.json({
        error: 'Cannot generate certificate',
        details: `Sample must be in 'review', 'certified' or 'rejected' workflow stage. Current stage: ${sample.workflow_stage || 'unknown'}.`
      }, { status: 400 })
    }

    // One certificate per contract: mint for every member of this sample's
    // group that has none yet, in contract order, and leave any that already
    // exists exactly as it is — this endpoint makes sure certificates exist;
    // it is not a re-certification (that is the finalize flow).
    const { data: ownCert } = await supabase
      .from('certificates')
      .select('id')
      .eq('sample_id', id)
      .maybeSingle()

    if (!ownCert && !sample.client_id) {
      return NextResponse.json({
        error: 'Cannot generate certificate - sample has no client assigned'
      }, { status: 400 })
    }

    // valid_from is today, valid_until is 1 year from now
    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    const group = await mintGroupCertificates(supabase, id, {
      issuedBy: user.id,
      isRejected,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      reviseExisting: false,
    })

    const ownFailure = group.failed.find((f) => f.sampleId === id)
    if (ownFailure) {
      console.error('Error creating certificate:', ownFailure.error)
      return NextResponse.json({
        error: 'Failed to create certificate record',
        details: ownFailure.error
      }, { status: 500 })
    }
    const certificate = group.certificates[id]
    if (!certificate) {
      return NextResponse.json({ error: 'Failed to create certificate record' }, { status: 500 })
    }
    if (group.failed.length > 0) {
      console.error('[Certificate POST] Sibling certificates failed for sample', id, group.failed)
    }

    if (ownCert) {
      return NextResponse.json({
        message: 'Certificate already exists',
        certificate: { id: certificate.id, certificate_number: certificate.certificate_number },
        group: { minted: group.minted, failed: group.failed },
      })
    }

    return NextResponse.json({
      message: 'Certificate created',
      certificate,
      group: { minted: group.minted, failed: group.failed },
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/samples/[id]/certificate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * A legacy ?contract_id= (a sample_contracts id) maps to the sibling sample it
 * became through the migration table. The archive table itself is never read;
 * an id the map does not know falls back to the sample the URL named.
 */
async function resolveLegacyContractId(
  supabase: any,
  sampleId: string,
  legacyContractId: string | null,
): Promise<string> {
  if (!legacyContractId) return sampleId
  const { data } = await supabase
    .from('sample_contract_migrations')
    .select('sibling_sample_id')
    .eq('sample_contract_id', legacyContractId)
    .maybeSingle()
  return (data as { sibling_sample_id?: string } | null)?.sibling_sample_id ?? sampleId
}
