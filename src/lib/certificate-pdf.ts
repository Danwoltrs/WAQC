import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSampleIdForSlug } from '@/lib/certificate-slug'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { generateQRCode } from '@/lib/qr-code'
import { buildCertificateFilename } from '@/lib/certificate-filename'
import { trackingNumberToSlug } from '@/lib/utils'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * Shared helper: build a NextResponse that streams a certificate PDF.
 * Behavior is identical to the original public route body (post-slug-conversion).
 * The caller is responsible for supplying a service-role Supabase client.
 */
export async function buildCertificatePdfResponse(
  supabaseService: SupabaseClient,
  slug: string,
  opts?: { skipCache?: boolean; buyerSlug?: string | null; sampleId?: string | null },
): Promise<NextResponse> {
  try {
    // The slug is the OFFICIAL certificate number on tins printed since the
    // label rebuild, and the internal tracking number on everything before it.
    // The buyer only matters when that number belongs to more than one client.
    // A caller that already knows the sample (the portal verifies ownership
    // before it gets here) passes it and skips resolution entirely — a number
    // shared by two clients must not turn its download into a 404.
    const sampleId = opts?.sampleId
      ?? (await resolveSampleIdForSlug(supabaseService, slug, opts?.buyerSlug))

    let sample: any = null
    if (sampleId) {
      const { data } = await supabaseService
        .from('samples')
        .select('id, tracking_number, workflow_stage, buyer_contract_nr')
        .eq('id', sampleId)
        .is('deleted_at', null)
        .maybeSingle()
      sample = data
    }

    if (!sample) {
      return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
    }

    // Only serve PDFs for certified/rejected samples
    const isCertified = sample.workflow_stage === 'certified' || sample.workflow_stage === 'rejected'
    if (!isCertified) {
      return NextResponse.json({ error: 'Sample has not been certified yet' }, { status: 404 })
    }

    // Get certificate record
    const { data: certificate } = await supabaseService
      .from('certificates')
      .select('id, certificate_number, pdf_url')
      .eq('sample_id', sample.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }

    // Filename: "<certNumber>_<buyerRef>.pdf" (buyer ref appended when known)
    const pdfFilename = buildCertificateFilename(certificate.certificate_number, sample.buyer_contract_nr)

    // Try cached PDF first (skip with skipCache option)
    const skipCache = opts?.skipCache ?? false
    if (!skipCache && certificate.pdf_url) {
      const cachedBuffer = await getCachedCertificatePdf(supabaseService, certificate.pdf_url)
      if (cachedBuffer) {
        return new NextResponse(new Uint8Array(cachedBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${pdfFilename}"`,
            'Cache-Control': 'public, max-age=3600',
          },
        })
      }
    }

    // Generate PDF on the fly. Pass the service-role client through — this is
    // a public endpoint, so the default cookie client would be blocked by RLS.
    const certificateData = await getCertificateData(sample.id, supabaseService)
    if (!certificateData) {
      return NextResponse.json({ error: 'Certificate data not available' }, { status: 500 })
    }

    // Load assets
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('Error loading Wolthers logo:', err)
    }

    let clientLogoBase64: string | undefined
    if (certificateData.client?.logo_url) {
      try {
        const response = await fetch(certificateData.client.logo_url)
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

    // Generate sample photo QR code if photos exist
    let samplePhotoQrBase64: string | undefined
    let samplePhotoUrl: string | undefined
    try {
      const { data: assessment } = await supabaseService
        .from('quality_assessments')
        .select('defect_photos')
        .eq('sample_id', sample.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (assessment?.defect_photos && Array.isArray(assessment.defect_photos) && assessment.defect_photos.length > 0) {
        // /sample-photo/[slug] only resolves against samples.tracking_number,
        // so this must use the resolved sample's own tracking number — not the
        // incoming slug, which may be a certificate number that 404s there.
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
        samplePhotoUrl = `${baseUrl}/sample-photo/${trackingNumberToSlug(sample.tracking_number)}`
        samplePhotoQrBase64 = await generateQRCode(samplePhotoUrl, { width: 150, margin: 1 })
      }
    } catch (err) {
      console.error('Error generating sample photo QR:', err)
    }

    const certificateElement = React.createElement(QualityCertificate, {
      data: certificateData,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
      samplePhotoQrBase64,
      samplePhotoUrl,
    })
    const pdfBuffer = await renderToBuffer(certificateElement as any)

    // Cache for next time
    uploadCertificatePdf(supabaseService, sample.id, certificate.id, Buffer.from(pdfBuffer))
      .catch((err) => console.error('[PublicPDF] Cache upload failed:', err))

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdfFilename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in buildCertificatePdfResponse:', error)
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 })
  }
}
