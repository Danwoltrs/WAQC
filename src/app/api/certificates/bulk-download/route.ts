import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import React from 'react'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

/**
 * POST /api/certificates/bulk-download
 * Generate and download multiple certificates as a ZIP file
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { certificateIds } = body

    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return NextResponse.json({ error: 'No certificates specified' }, { status: 400 })
    }

    // Limit to prevent memory issues
    if (certificateIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 certificates per download' }, { status: 400 })
    }

    // Get certificate records to find sample IDs (include pdf_url for caching)
    const { data: certificates, error: certError } = await supabase
      .from('certificates')
      .select('id, certificate_number, sample_id, pdf_url')
      .in('id', certificateIds)

    if (certError || !certificates) {
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // Load Wolthers logo once
    let wolthersLogoBase64: string | undefined
    try {
      const logoPath = path.join(process.cwd(), 'public/images/logos/wolthers-logo-green.png')
      const logoBuffer = fs.readFileSync(logoPath)
      wolthersLogoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
    } catch (err) {
      console.error('Error loading Wolthers logo:', err)
    }

    // Create ZIP file
    const zip = new JSZip()

    // Generate each PDF and add to ZIP (use cached PDFs when available)
    for (const cert of certificates) {
      if (!cert.sample_id) continue

      try {
        // Try cached PDF first
        if (cert.pdf_url) {
          const cachedBuffer = await getCachedCertificatePdf(supabase, cert.pdf_url)
          if (cachedBuffer) {
            const filename = `${cert.certificate_number}.pdf`
            zip.file(filename, cachedBuffer)
            continue
          }
        }

        // Get certificate data
        const certificateData = await getCertificateData(cert.sample_id)
        if (!certificateData) continue

        // Load client logo if available
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

        // Load country flag
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

        // Render PDF
        const certificateElement = React.createElement(QualityCertificate, {
          data: certificateData,
          wolthersLogoBase64,
          clientLogoBase64,
          flagBase64,
        })
        const pdfBuffer = await renderToBuffer(certificateElement as any)

        // Cache the generated PDF
        uploadCertificatePdf(supabase, cert.sample_id, cert.id, Buffer.from(pdfBuffer))
          .catch((err) => console.error('[BulkDownload] Cache upload failed:', err))

        // Add to ZIP with certificate number as filename
        const filename = `${cert.certificate_number}.pdf`
        zip.file(filename, pdfBuffer)
      } catch (pdfError) {
        console.error(`Error generating PDF for certificate ${cert.id}:`, pdfError)
        // Continue with other certificates
      }
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    // Return ZIP file
    const timestamp = new Date().toISOString().split('T')[0]
    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="certificates-${timestamp}.zip"`,
      },
    })
  } catch (error) {
    console.error('Error in POST /api/certificates/bulk-download:', error)
    return NextResponse.json({
      error: 'Failed to generate certificates',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
