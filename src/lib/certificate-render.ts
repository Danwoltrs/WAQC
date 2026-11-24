import type { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import { getCertificateData } from '@/lib/certificate-data'
import {
  QualityCertificate,
  QualityCertificateBundle,
  type QualityCertificateProps,
} from '@/components/pdf/certificate/quality-certificate'
import { getCountryCodeFromOrigin, getFlagPath } from '@/lib/country-flags'
import { generateQRCode, getSamplePhotoUrl } from '@/lib/qr-code'
import React from 'react'
import fs from 'fs'
import path from 'path'

/**
 * Everything one certificate page needs: its data and its images (Wolthers
 * logo, client logo, country flag, sample-photo QR). Null when the sample has
 * no certificate data.
 *
 * One sample, one certificate: a contract sibling renders its own row.
 */
export async function loadCertificateProps(
  supabase: SupabaseClient,
  sampleId: string,
): Promise<QualityCertificateProps | null> {
  const certificateData = await getCertificateData(sampleId, supabase)
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
    if (Array.isArray(photos) && photos.length > 0) {
      // Named by the certificate number (+ buyer), never the SAN- lab number;
      // the sample id form when no real certificate exists yet. The id-less
      // placeholder certificate (first render) carries no number of its own.
      const cert = certificateData.certificate
      samplePhotoUrl = getSamplePhotoUrl({
        sampleId,
        certificateNumber: cert?.id ? cert.certificate_number : null,
        buyerName: certificateData.client?.fantasy_name || certificateData.client?.name || null,
      })
      samplePhotoQrBase64 = await generateQRCode(samplePhotoUrl, { width: 150, margin: 1 })
    }
  } catch (err) {
    console.error('[CertRender] Error generating sample photo QR:', err)
  }

  return {
    data: certificateData,
    wolthersLogoBase64,
    clientLogoBase64,
    flagBase64,
    samplePhotoQrBase64,
    samplePhotoUrl,
  }
}

/**
 * Render a sample's quality certificate to a PDF Buffer. Returns null when the
 * sample has no certificate data.
 */
export async function renderCertificatePdfBuffer(
  supabase: SupabaseClient,
  sampleId: string,
): Promise<Buffer | null> {
  const props = await loadCertificateProps(supabase, sampleId)
  if (!props) return null
  const pdfBuffer = await renderToBuffer(React.createElement(QualityCertificate, props) as any)
  return Buffer.from(pdfBuffer)
}

/**
 * Render several samples' certificates into ONE PDF, one page each, in the
 * order given: what "Print certificates" sends to the printer. A sample whose
 * certificate cannot be built is left out and named in `missing`; `pdf` is null
 * when none could be.
 */
export async function renderCertificateBundlePdfBuffer(
  supabase: SupabaseClient,
  sampleIds: string[],
): Promise<{ pdf: Buffer | null; rendered: string[]; missing: string[] }> {
  const certificates: QualityCertificateProps[] = []
  const rendered: string[] = []
  const missing: string[] = []
  for (const sampleId of sampleIds) {
    let props: QualityCertificateProps | null = null
    try {
      props = await loadCertificateProps(supabase, sampleId)
    } catch (err) {
      console.error('[CertRender] certificate data failed for a bundled sample:', err)
    }
    if (props) {
      certificates.push(props)
      rendered.push(sampleId)
    } else {
      missing.push(sampleId)
    }
  }
  if (certificates.length === 0) return { pdf: null, rendered, missing }
  const pdfBuffer = await renderToBuffer(React.createElement(QualityCertificateBundle, { certificates }) as any)
  return { pdf: Buffer.from(pdfBuffer), rendered, missing }
}
