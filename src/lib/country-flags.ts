/**
 * Country flags utility for coffee certificate generation
 * Maps coffee origin names to country codes and flag paths
 */

// Map origin names (various spellings) to ISO 3166-1 alpha-2 country codes
const ORIGIN_TO_COUNTRY_CODE: Record<string, string> = {
  // Brazil
  'brazil': 'BR',
  'brasil': 'BR',
  'brazilian': 'BR',

  // Colombia
  'colombia': 'CO',
  'colombian': 'CO',

  // Guatemala
  'guatemala': 'GT',
  'guatemalan': 'GT',

  // Peru
  'peru': 'PE',
  'peruvian': 'PE',

  // Honduras
  'honduras': 'HN',
  'honduran': 'HN',

  // Mexico
  'mexico': 'MX',
  'mexican': 'MX',
  'méxico': 'MX',

  // Nicaragua
  'nicaragua': 'NI',
  'nicaraguan': 'NI',

  // El Salvador
  'el salvador': 'SV',
  'salvador': 'SV',
  'salvadoran': 'SV',
}

// Country code to full country name for display
export const COUNTRY_NAMES: Record<string, string> = {
  'BR': 'Brazil',
  'CO': 'Colombia',
  'GT': 'Guatemala',
  'PE': 'Peru',
  'HN': 'Honduras',
  'MX': 'Mexico',
  'NI': 'Nicaragua',
  'SV': 'El Salvador',
}

/**
 * Get country code from origin string
 * @param origin - The origin name (e.g., "Brazil", "Colombia")
 * @returns ISO 3166-1 alpha-2 country code or null if not found
 */
export function getCountryCodeFromOrigin(origin: string): string | null {
  if (!origin) return null
  const normalized = origin.toLowerCase().trim()
  return ORIGIN_TO_COUNTRY_CODE[normalized] || null
}

/**
 * Get the flag PNG file path for a country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @returns Path to the flag PNG file
 */
export function getFlagPath(countryCode: string): string {
  return `/images/flags/${countryCode}.png`
}

/**
 * Get the full flag path from an origin string
 * @param origin - The origin name (e.g., "Brazil", "Colombia")
 * @returns Path to the flag PNG file or null if origin not recognized
 */
export function getFlagPathFromOrigin(origin: string): string | null {
  const countryCode = getCountryCodeFromOrigin(origin)
  if (!countryCode) return null
  return getFlagPath(countryCode)
}

/**
 * Get country name from origin string
 * @param origin - The origin name
 * @returns Standardized country name or the original origin if not found
 */
export function getCountryName(origin: string): string {
  const countryCode = getCountryCodeFromOrigin(origin)
  if (!countryCode) return origin
  return COUNTRY_NAMES[countryCode] || origin
}

/**
 * List of supported country codes for flags
 */
export const SUPPORTED_COUNTRY_CODES = ['BR', 'CO', 'GT', 'PE', 'HN', 'MX', 'NI', 'SV'] as const

export type SupportedCountryCode = typeof SUPPORTED_COUNTRY_CODES[number]
