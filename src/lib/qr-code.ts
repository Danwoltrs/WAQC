import QRCode from 'qrcode'
import { trackingNumberToSlug } from '@/lib/utils'

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
 * Generate a public certificate page URL for QR codes on labels/sleeves
 * @param trackingNumber - The sample tracking number (e.g. BD-890227/26)
 * @returns URL string for the public certificate page
 */
export function getCertificatePageUrl(trackingNumber: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://qc.wolthers.com'
  return `${baseUrl}/certificate/${trackingNumberToSlug(trackingNumber)}`
}

/**
 * Data for building a text-based QR code with certificate summary
 */
export interface CertificateQRData {
  trackingNumber: string
  primaryDefects?: number | null
  secondaryDefects?: number | null
  totalDefects?: number | null
  screenSizes?: Record<string, number> | null
}

/**
 * Fetch quality assessment data for a sample to include in QR text.
 * Pass any Supabase client (server or service role).
 */
export async function fetchCertificateQRData(
  supabase: any,
  sampleId: string,
  trackingNumber: string
): Promise<CertificateQRData> {
  const data: CertificateQRData = { trackingNumber }

  const { data: assessment } = await supabase
    .from('quality_assessments')
    .select('green_bean_data')
    .eq('sample_id', sampleId)
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
  const url = getCertificatePageUrl(data.trackingNumber)
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
