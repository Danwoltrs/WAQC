import QRCode from 'qrcode'
import { trackingNumberToSlug } from '@/lib/utils'
import { companyNameToSlug } from '@/lib/company-slug'
import { resolveLabSourceId } from '@/lib/sample-group'

/**
 * Generate a QR code as a data URL
 * @param data - The data to encode in the QR code
 * @param options - QR code generation options
 * @returns Promise resolving to a data URL string
 */
export async function generateQRCode(
  data: string,
  options?: {
    width?: number
    margin?: number
    color?: {
      dark?: string
      light?: string
    }
  }
): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(data, {
      width: options?.width || 200,
      margin: options?.margin || 2,
      color: {
        dark: options?.color?.dark || '#000000',
        light: options?.color?.light || '#FFFFFF',
      },
    })
    return dataUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw new Error('Failed to generate QR code')
  }
}

/**
 * Generate multiple QR codes in batch
 * @param items - Array of data strings to generate QR codes for
 * @param options - QR code generation options
 * @returns Promise resolving to an array of data URLs
 */
export async function generateQRCodeBatch(
  items: string[],
  options?: {
    width?: number
    margin?: number
    color?: {
      dark?: string
      light?: string
    }
  }
): Promise<string[]> {
  try {
    const qrCodes = await Promise.all(
      items.map((item) => generateQRCode(item, options))
    )
    return qrCodes
  } catch (error) {
    console.error('Error generating QR codes in batch:', error)
    throw new Error('Failed to generate QR codes')
  }
}

/**
 * Generate a cupping session URL for QR code
 * @param sessionId - The cupping session ID
 * @param sampleId - The sample ID
 * @returns URL string for the cupping session
 */
export function getCuppingSessionUrl(sessionId: string, sampleId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
  return `${baseUrl}/cupping/${sessionId}/sample/${sampleId}`
}

/**
 * Generate a sample tracking URL for QR code
 * @param trackingNumber - The sample tracking number
 * @returns URL string for sample tracking
 */
export function getSampleTrackingUrl(trackingNumber: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
  return `${baseUrl}/samples/${trackingNumberToSlug(trackingNumber)}`
}

/**
 * Generate a certificate download URL for QR code
 * @param sampleId - The sample ID
 * @returns URL string for certificate download
 */
export function getCertificateDownloadUrl(sampleId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
  return `${baseUrl}/api/samples/${sampleId}/certificate`
}

/**
 * Public certificate page URL for QR codes on labels/sleeves.
 *
 * Tin sleeves pass the OFFICIAL certificate number (e.g. "BR-036991/26"); the
 * internal SAN- lab number must never reach a printed label or a QR payload.
 * Legacy callers may still pass a tracking number — the public route resolves
 * both.
 *
 * The buyer goes in front (/certificate/arvid-nordquist/000001_26) because
 * certificate numbers are unique per client, not globally: without it a bare
 * number like 000001/26 matches two clients and the page refuses to guess.
 * Omit it and the URL stays the one-segment form every tin printed before this
 * carries — both resolve.
 *
 * @param reference - certificate number, or a legacy tracking number
 * @param buyerName - the QC client the certificate is issued to
 */
export function getCertificatePageUrl(reference: string, buyerName?: string | null): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
  const buyer = companyNameToSlug(buyerName)
  const number = trackingNumberToSlug(reference)
  return buyer
    ? `${baseUrl}/certificate/${buyer}/${number}`
    : `${baseUrl}/certificate/${number}`
}

/**
 * Data for building a text-based QR code with certificate summary
 */
export interface CertificateQRData {
  trackingNumber: string
  /** QC client the certificate belongs to; disambiguates a per-client number. */
  buyerName?: string | null
  primaryDefects?: number | null
  secondaryDefects?: number | null
  totalDefects?: number | null
  screenSizes?: Record<string, number> | null
}

/**
 * Fetch quality assessment data for a sample to include in QR text.
 * Pass any Supabase client (server or service role).
 *
 * `sampleId` may be a contract sibling (one bag sleeve per certificate): its
 * certificate is its own, but the green-bean reading lives on the lab unit it
 * points at, so the assessment is read through `lab_source_sample_id`.
 */
export async function fetchCertificateQRData(
  supabase: any,
  sampleId: string,
  trackingNumber: string
): Promise<CertificateQRData> {
  const data: CertificateQRData = { trackingNumber }

  // The buyer rides in the URL because certificate numbers are unique per
  // client, not globally — without it a bare 000001/26 matches two clients and
  // the public page refuses to guess. Resolved here so every caller gets it.
  const { data: cert } = await supabase
    .from('certificates')
    .select('client:companies!certificates_client_id_fkey(fantasy_name, name)')
    .eq('sample_id', sampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  data.buyerName = cert?.client?.fantasy_name || cert?.client?.name || null

  const labSampleId = await resolveLabSourceId(supabase, sampleId)
  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', labSampleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (assessment?.green_bean_data) {
    const gb = assessment.green_bean_data as any
    data.screenSizes = gb.screen_sizes || null
    const defects = gb.defects
    if (defects) {
      data.primaryDefects = defects.total_primary ?? defects.primary ?? null
      data.secondaryDefects = defects.total_secondary ?? defects.secondary ?? null
      data.totalDefects = defects.total ?? (
        data.primaryDefects != null && data.secondaryDefects != null
          ? data.primaryDefects + data.secondaryDefects
          : null
      )
    }
  }

  return data
}

/**
 * Build a text-based QR code content with certificate summary + URL.
 * Shows: tracking number, defects, screen distribution, and link.
 */
export function buildCertificateQRText(data: CertificateQRData): string {
  const url = getCertificatePageUrl(data.trackingNumber, data.buyerName)
  const lines: string[] = [data.trackingNumber]

  // Defects line
  if (data.totalDefects != null) {
    let defLine = `Def: ${data.totalDefects}`
    if (data.primaryDefects != null && data.secondaryDefects != null) {
      defLine += ` (${data.primaryDefects}p|${data.secondaryDefects}s)`
    }
    lines.push(defLine)
  }

  // Screen sizes - grouped into ranges (e.g. "17/18:5% 14-16:65% Pan:2%")
  if (data.screenSizes) {
    const numbered: Array<{ num: number; pct: number }> = []
    let panPct = 0
    for (const [key, pct] of Object.entries(data.screenSizes)) {
      if (pct === 0) continue
      if (/^(pan|fundo|bottom)$/i.test(key)) {
        panPct += pct
      } else {
        const num = parseInt(key.replace(/\D/g, ''))
        if (!isNaN(num)) numbered.push({ num, pct })
      }
    }
    numbered.sort((a, b) => b.num - a.num)

    // Group consecutive screens into ranges
    const groups: Array<{ label: string; pct: number }> = []
    let i = 0
    while (i < numbered.length) {
      let j = i
      let groupPct = numbered[i].pct
      while (j + 1 < numbered.length && numbered[j].num - numbered[j + 1].num === 1) {
        j++
        groupPct += numbered[j].pct
      }
      if (i === j) {
        groups.push({ label: String(numbered[i].num), pct: groupPct })
      } else if (j - i === 1) {
        groups.push({ label: `${numbered[i].num}/${numbered[j].num}`, pct: groupPct })
      } else {
        groups.push({ label: `${numbered[j].num}-${numbered[i].num}`, pct: groupPct })
      }
      i = j + 1
    }
    if (panPct > 0) groups.push({ label: 'Pan', pct: panPct })

    if (groups.length > 0) {
      lines.push(groups.map(g => `${g.label}:${Math.round(g.pct)}%`).join(' '))
    }
  }

  lines.push(url)
  return lines.join('\n')
}
