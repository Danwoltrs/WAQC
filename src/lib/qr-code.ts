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
