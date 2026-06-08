import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { getCachedCertificatePdf, uploadCertificatePdf } from '@/lib/certificate-storage'
import { buildCertificateFilename } from '@/lib/certificate-filename'
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
      .select('id, certificate_number, sample_id, sample_contract_id, pdf_url')
      .in('id', certificateIds)

    if (certError || !certificates) {
      return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 })
    }

    // Resolve buyer references for filenames: a sub-contract cert uses its own
    // buyer_contract_nr, a mother cert uses the sample's. Batched to avoid N queries.
    const subIds = Array.from(new Set(certificates.map(c => c.sample_contract_id).filter(Boolean))) as string[]
    const sampleIds = Array.from(new Set(certificates.map(c => c.sample_id).filter(Boolean))) as string[]
    const subRefMap = new Map<string, string | null>()
    const sampleRefMap = new Map<string, string | null>()
    if (subIds.length) {
      const { data } = await supabase.from('sample_contracts').select('id, buyer_contract_nr').in('id', subIds)
      for (const r of (data || []) as any[]) subRefMap.set(r.id, r.buyer_contract_nr ?? null)
    }
    if (sampleIds.length) {
      const { data } = await supabase.from('samples').select('id, buyer_contract_nr').in('id', sampleIds)
      for (const r of (data || []) as any[]) sampleRefMap.set(r.id, r.buyer_contract_nr ?? null)
    }
    const buyerRefFor = (c: { sample_id: string | null; sample_contract_id: string | null }) =>
      (c.sample_contract_id ? subRefMap.get(c.sample_contract_id) : null) ??
      (c.sample_id ? sampleRefMap.get(c.sample_id) : null) ?? null

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
            const filename = buildCertificateFilename(cert.certificate_number, buyerRefFor(cert))
            zip.file(filename, cachedBuffer)
            continue
          }
        }

        // Get certificate data (pass contract_id for sub-contract certificates)
        const certificateData = await getCertificateData(cert.sample_id, cert.sample_contract_id || undefined)
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

        // Add to ZIP with buyer reference (when present) + certificate number
        const filename = buildCertificateFilename(cert.certificate_number, buyerRefFor(cert))
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
