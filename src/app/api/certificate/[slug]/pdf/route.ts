import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { slugToTrackingNumber } from '@/lib/utils'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import React from 'react'
import fs from 'fs'
import path from 'path'

// Use service role to bypass RLS for public access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/certificate/[slug]/pdf
 * Public endpoint - serves the certificate PDF directly.
 * No authentication required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const trackingNumber = slugToTrackingNumber(slug)

    // Find sample
    let sample: any = null
    const { data: directMatch } = await supabase
      .from('samples')
      .select('id, tracking_number, workflow_stage')
      .eq('tracking_number', trackingNumber)
      .is('deleted_at', null)
      .maybeSingle()

    if (directMatch) {
      sample = directMatch
    } else {
      const { data: fallback } = await supabase
        .from('samples')
        .select('id, tracking_number, workflow_stage')
        .ilike('tracking_number', trackingNumber)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      sample = fallback
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
    const { data: certificate } = await supabase
      .from('certificates')
      .select('id, certificate_number, pdf_url')
      .eq('sample_id', sample.id)
      .is('sample_contract_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!certificate) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }

    // Build sanitized filename: replace / with _, use lowercase r- for rejected
    const sanitizeFilename = (certNum: string) => {
      let name = certNum.replace(/\//g, '_')
      if (name.startsWith('R-')) name = 'r-' + name.slice(2)
      return name
    }
    const pdfFilename = sanitizeFilename(certificate.certificate_number) + '.pdf'

    // Try cached PDF first
    if (certificate.pdf_url) {
      const cachedBuffer = await getCachedCertificatePdf(supabase, certificate.pdf_url)
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

    // Generate PDF on the fly
    const certificateData = await getCertificateData(sample.id)
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

    const certificateElement = React.createElement(QualityCertificate, {
      data: certificateData,
      wolthersLogoBase64,
      clientLogoBase64,
      flagBase64,
    })
    const pdfBuffer = await renderToBuffer(certificateElement as any)

    // Cache for next time
    uploadCertificatePdf(supabase, sample.id, certificate.id, Buffer.from(pdfBuffer))
      .catch((err) => console.error('[PublicPDF] Cache upload failed:', err))

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${pdfFilename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error in GET /api/certificate/[slug]/pdf:', error)
    return NextResponse.json({ error: 'Failed to generate certificate' }, { status: 500 })
  }
}
