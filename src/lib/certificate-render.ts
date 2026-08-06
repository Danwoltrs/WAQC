import type { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import { QualityCertificate } from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { generateQRCode } from '@/lib/qr-code'
import { trackingNumberToSlug } from '@/lib/utils'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * Render a sample's quality certificate to a PDF Buffer.
 *
 * Encapsulates the asset loading (Wolthers logo, client logo, country flag,
 * sample-photo QR) + @react-pdf render that was previously duplicated across
 * the public PDF route and the certificate email route. Returns null when the
 * sample has no certificate data.
 *
 * Pass `sampleContractId` to render a commercial split's OWN certificate (its
 * number and parties); omit it for the sample's mother certificate.
 */
export async function renderCertificatePdfBuffer(
  supabase: SupabaseClient,
  sampleId: string,
  sampleContractId?: string | null,
): Promise<Buffer | null> {
  const certificateData = await getCertificateData(sampleId, sampleContractId ?? undefined, supabase)
  if (!certificateData) return null

  let wolthersLogoBase64: string | undefined
  try {
    const logoPath = path.join(
      process.cwd(),
      'public/images/logos/wolthers-logo-green.png',
    )
    wolthersLogoBase64 = `data:image/png;base64,${fs
      .readFileSync(logoPath)
      .toString('base64')}`
  } catch (err) {
    console.error('[CertRender] Error loading Wolthers logo:', err)
  }

  let clientLogoBase64: string | undefined
  if (certificateData.client?.logo_url) {
    try {
      const response = await fetch(certificateData.client.logo_url)
      if (response.ok) {
        const base64 = Buffer.from(await response.arrayBuffer()).toString('base64')
        const contentType = response.headers.get('content-type') || 'image/png'
        clientLogoBase64 = `data:${contentType};base64,${base64}`
      }
    } catch (err) {
      console.error('[CertRender] Error loading client logo:', err)
    }
  }

  let flagBase64: string | undefined
  const countryCode = getCountryCodeFromOrigin(certificateData.sample.origin)
  if (countryCode) {
    try {
      const flagPath = path.join(process.cwd(), 'public', getFlagPath(countryCode))
      flagBase64 = `data:image/png;base64,${fs
        .readFileSync(flagPath)
        .toString('base64')}`
    } catch (err) {
      console.error('[CertRender] Error loading flag:', err)
    }
  }

  let samplePhotoQrBase64: string | undefined
  let samplePhotoUrl: string | undefined
  try {
    const { data: assessment } = await supabase
      .from('quality_assessments')
      .select('defect_photos')
      .eq('sample_id', sampleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const photos = (assessment as any)?.defect_photos
    const tracking = certificateData.sample.tracking_number
    if (Array.isArray(photos) && photos.length > 0 && tracking) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
      samplePhotoUrl = `${baseUrl}/sample-photo/${trackingNumberToSlug(tracking)}`
      samplePhotoQrBase64 = await generateQRCode(samplePhotoUrl, { width: 150, margin: 1 })
    }
  } catch (err) {
    console.error('[CertRender] Error generating sample photo QR:', err)
  }

  const element = React.createElement(QualityCertificate, {
    data: certificateData,
    wolthersLogoBase64,
    clientLogoBase64,
    flagBase64,
    samplePhotoQrBase64,
    samplePhotoUrl,
  })
  const pdfBuffer = await renderToBuffer(element as any)
  return Buffer.from(pdfBuffer)
}
