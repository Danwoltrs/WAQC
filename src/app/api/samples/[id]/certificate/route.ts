import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { writeDecisionToShipmentSamples } from '@/lib/approval-notification/sys-decision-writeback'
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
    const { id, error: resolveError } = await resolveSampleId(supabase, idOrSlug)
    if (!id) {
      return NextResponse.json({ error: resolveError || 'Sample not found' }, { status: 404 })
    }
    console.log('[Certificate] Generating PDF for sample:', id)

    // NOTE: the certificate always shows the CURRENT sys.wolthers seller/buyer
    // references via read-through in getCertificateData() — no write is performed on
    // this read path, so any authenticated viewer gets the right numbers without
    // triggering (editor-only) database writes.

    // Check for sub-contract certificate request
    const contractId = request.nextUrl.searchParams.get('contract_id')

    // Bypass the stored-PDF cache when developing (so template/layout code
    // changes are reflected immediately) or when explicitly asked via ?nocache=1.
    // The fresh render still re-caches below, updating the shared cache.
    const bypassCache =
      process.env.NODE_ENV !== 'production' ||
      request.nextUrl.searchParams.get('nocache') === '1'

    // Resolve the buyer reference for the filename: a sub-contract uses its own
    // buyer_contract_nr, the mother cert uses the sample's. Buyers (e.g. Ahold)
    // ask for their contract reference in the filename alongside the cert number.
    let buyerRef: string | null = null
    if (contractId) {
      const { data: scRow } = await supabase
        .from('sample_contracts')
        .select('buyer_contract_nr')
        .eq('id', contractId)
        .maybeSingle()
      buyerRef = (scRow as any)?.buyer_contract_nr ?? null
    } else {
      const { data: sRow } = await supabase
        .from('samples')
        .select('buyer_contract_nr')
        .eq('id', id)
        .maybeSingle()
      buyerRef = (sRow as any)?.buyer_contract_nr ?? null
    }

    // Check for cached PDF first
    let certQuery = supabase
      .from('certificates')
      .select('id, certificate_number, pdf_url')
      .eq('sample_id', id)

    if (contractId) {
      certQuery = certQuery.eq('sample_contract_id', contractId)
    } else {
      certQuery = certQuery.is('sample_contract_id', null)
    }

    const { data: certificate } = await certQuery
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
    const certificateData = await getCertificateData(id, contractId || undefined)
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
      uploadCertificatePdf(supabase, id, certificate.id, Buffer.from(pdfBuffer), contractId || undefined)
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
      .select(`
        id,
        tracking_number,
        client_id,
        origin,
        workflow_stage,
        status,
        quality_spec_id,
        client:companies!samples_client_id_fkey(id, name, company:name, fantasy_name)
      `)
      .eq('id', id)
      .single()

    if (sampleError || !sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

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
        .eq('sample_id', id)
        .limit(1)

      // Check for grading data (quality_assessments with green_bean_data)
      const { data: gradingData } = await supabase
        .from('quality_assessments')
        .select('id, green_bean_data')
        .eq('sample_id', id)
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

      // Update sample workflow_stage to certified
      await supabase
        .from('samples')
        .update({
          workflow_stage: 'certified',
          status: 'approved'
        })
        .eq('id', id)

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

    // Check if mother certificate already exists
    const { data: existingCert } = await supabase
      .from('certificates')
      .select('id, certificate_number, issued_by, valid_from, valid_until, is_rejected')
      .eq('sample_id', id)
      .is('sample_contract_id', null)
      .maybeSingle()

    if (existingCert) {
      // Mother cert exists — still ensure sub-contract certificates are created
      await createSubContractCertificates(supabase, id, {
        ...existingCert,
        issued_by: existingCert.issued_by || user.id,
      }, user.id, sample.origin, sample.quality_spec_id)

      return NextResponse.json({
        message: 'Certificate already exists',
        certificate: { id: existingCert.id, certificate_number: existingCert.certificate_number }
      })
    }

    if (!sample.client_id) {
      return NextResponse.json({
        error: 'Cannot generate certificate - sample has no client assigned'
      }, { status: 400 })
    }

    // Get client name for issued_to (required field)
    const clientData = sample.client as { name?: string; company?: string; fantasy_name?: string } | null
    const issuedTo = clientData?.fantasy_name || clientData?.company || clientData?.name || 'Unknown Client'

    // Create certificate record
    // valid_from is today, valid_until is 1 year from now
    const validFrom = new Date()
    const validUntil = new Date(validFrom)
    validUntil.setFullYear(validUntil.getFullYear() + 1)

    const { data: newCert, error: createError } = await supabase
      .from('certificates')
      .insert({
        sample_id: id,
        certificate_number: null as unknown as string,
        issued_to: issuedTo,
        issued_by: user.id,
        status: 'issued',
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        is_rejected: isRejected,
      })
      .select('id, certificate_number, created_at')
      .single()

    if (createError) {
      console.error('Error creating certificate:', createError)
      return NextResponse.json({
        error: 'Failed to create certificate record',
        details: createError.message
      }, { status: 500 })
    }

    // Auto-create certificates for sub-contracts
    await createSubContractCertificates(supabase, id, {
      id: newCert.id,
      issued_by: user.id,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      is_rejected: isRejected,
    }, user.id, sample.origin, sample.quality_spec_id)

    return NextResponse.json({
      message: 'Certificate created',
      certificate: newCert
    }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/samples/[id]/certificate:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Create certificates for all sub-contracts that don't already have one.
 * Mirrors the pattern in cupping/finalize/route.ts lines 429-496.
 */
async function createSubContractCertificates(
  supabase: any,
  sampleId: string,
  motherCert: { id?: string; issued_by: string; valid_from: string; valid_until: string; is_rejected: boolean | null },
  userId: string,
  sampleOrigin?: string | null,
  sampleQualitySpecId?: string | null,
) {
  try {
    const { data: subContracts } = await supabase
      .from('sample_contracts')
      .select('id, tracking_number, client_id')
      .eq('sample_id', sampleId)
      .order('sort_order', { ascending: true })

    if (!subContracts || subContracts.length === 0) return

    // Get mother sample's client name for fallback issued_to
    const { data: sample } = await supabase
      .from('samples')
      .select('client_id, clients:companies!samples_client_id_fkey(fantasy_name, company:name)')
      .eq('id', sampleId)
      .single()

    const motherClient = sample?.clients as { fantasy_name?: string; company?: string } | null
    const motherIssuedTo = motherClient?.fantasy_name || motherClient?.company || 'Unknown Client'

    for (const sc of subContracts) {
      // Check if sub-contract certificate already exists
      const { data: existingSubCert } = await supabase
        .from('certificates')
        .select('id')
        .eq('sample_contract_id', sc.id)
        .maybeSingle()

      if (!existingSubCert) {
        const isRejected = motherCert.is_rejected ?? false

        // Get sub-contract's QC client name (or fall back to mother's)
        let subIssuedTo = motherIssuedTo
        if (sc.client_id && sc.client_id !== sample?.client_id) {
          const { data: subClient } = await (supabase as any)
            .from('companies')
            .select('fantasy_name, name')
            .eq('id', sc.client_id)
            .single()
          if (subClient) {
            subIssuedTo = subClient.fantasy_name || subClient.name || subIssuedTo
          }
        }

        // The error MUST be inspected: supabase-js resolves rather than throws,
        // so the surrounding try/catch never sees it. The number is minted by
        // the assign_certificate_number trigger, which RAISES when the sample
        // has no laboratory_id (unlike the mother's, which just reuses
        // tracking_number) — that failure was swallowed here, leaving the split
        // with no certificate and no number to print on the tin sleeve.
        const { error: subCertError } = await supabase
          .from('certificates')
          .insert({
            sample_id: sampleId,
            sample_contract_id: sc.id,
            certificate_number: null as unknown as string,
            issued_to: subIssuedTo,
            issued_by: userId,
            status: 'issued',
            valid_from: motherCert.valid_from,
            valid_until: motherCert.valid_until,
            is_rejected: isRejected,
          })

        if (subCertError) {
          console.error(
            `Failed to create certificate for sub-contract ${sc.id} of sample ${sampleId}:`,
            subCertError.message || subCertError,
            subCertError.details || '',
            subCertError.hint || '',
          )
        }
      }
    }
  } catch (err) {
    console.error('Error creating sub-contract certificates:', err)
    // Non-fatal: mother certificate was already created
  }
}

