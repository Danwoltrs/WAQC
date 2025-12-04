import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a tracking number to a URL-safe slug
 * SAK-048524/25 → SAK-048524_25
 * Replaces / with _ for URL safety
 */
export function trackingNumberToSlug(trackingNumber: string): string {
  // Handle JSON-wrapped tracking numbers
  let cleanNumber = trackingNumber
  if (trackingNumber.startsWith('{')) {
    try {
      const parsed = JSON.parse(trackingNumber)
      cleanNumber = parsed.pattern || trackingNumber
    } catch {
      // If parsing fails, use as-is
    }
  }
  // Replace / with _ for URL safety
  return cleanNumber.replace(/\//g, '_')
}

/**
 * Convert a URL slug back to a tracking number
 * SAK-048524_25 → SAK-048524/25
 * Replaces _ with / to restore original format
 */
export function slugToTrackingNumber(slug: string): string {
  return slug.replace(/_/g, '/')
}

/**
 * Check if a string looks like a UUID
 */
export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}