/**
 * Certificate Pattern Configuration Types
 * Used for client-specific certificate numbering patterns
 */

export interface CertificatePattern {
  has_quality_code: boolean
  quality_position: 'prefix' | 'suffix'
  has_origin_code: boolean
  origin_position: 'prefix' | 'suffix'
  sequence_padding: number
  starting_sequence: number
  year_format: 'YY' | 'YYYY'
  separator: string
}

export interface CertificateConfig {
  enabled: boolean
  include_logo: boolean
  include_signature: boolean
}

export interface TrackingNumberFormat {
  type: 'standard' | 'country_based' | 'quality_based'
  pattern: string
  separator: string
  rejected_suffix?: string
}

export const DEFAULT_CERTIFICATE_PATTERN: CertificatePattern = {
  has_quality_code: false,
  quality_position: 'prefix',
  has_origin_code: false,
  origin_position: 'prefix',
  sequence_padding: 6,
  starting_sequence: 1,
  year_format: 'YY',
  separator: '-'
}

export const DEFAULT_CERTIFICATE_CONFIG: CertificateConfig = {
  enabled: true,
  include_logo: true,
  include_signature: true
}

/**
 * Generate a preview of what the certificate number will look like
 * @param pattern - The certificate pattern configuration
 * @param qualityCode - Optional quality code (e.g., "AD" for Alfenas Dulce)
 * @param originCode - Optional origin code (e.g., "BR" for Brazil)
 * @returns Preview string (e.g., "AD-000123/25")
 */
export function generateCertificatePreview(
  pattern: CertificatePattern,
  qualityCode?: string,
  originCode?: string
): string {
  const {
    has_quality_code,
    quality_position,
    has_origin_code,
    origin_position,
    sequence_padding,
    starting_sequence,
    year_format,
    separator
  } = pattern

  let result = ''
  let prefix = ''
  let suffix = ''

  // Determine prefix
  if (has_quality_code && quality_position === 'prefix' && qualityCode) {
    prefix = qualityCode.toUpperCase()
  } else if (has_origin_code && origin_position === 'prefix' && originCode) {
    prefix = originCode.toUpperCase()
  }

  // Determine suffix
  if (has_quality_code && quality_position === 'suffix' && qualityCode) {
    suffix = qualityCode.toUpperCase()
  } else if (has_origin_code && origin_position === 'suffix' && originCode) {
    suffix = originCode.toUpperCase()
  }

  // Build the number
  if (prefix) {
    result += prefix + separator
  }

  result += String(starting_sequence).padStart(sequence_padding, '0')

  if (suffix) {
    result += separator + suffix
  }

  // Add year
  const year = year_format === 'YYYY'
    ? new Date().getFullYear().toString()
    : new Date().getFullYear().toString().slice(-2)

  result += '/' + year

  return result
}
