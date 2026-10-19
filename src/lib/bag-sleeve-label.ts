/**
 * Headline for the bag sleeve label.
 *
 * Never samples.tracking_number (the internal SAN- key). The sleeve leads with
 * the lot's own identifier (container, else ICO, else the exporter's sample
 * number), then the certificate number, then a neutral word.
 */
import { sampleIdentifier } from '@/lib/sample-reference'

export function bagSleeveHeadline(s: {
  container_nr?: string | null
  ico_number?: string | null
  exporter_sample_number?: string | null
  certificate_number?: string | null
}): string {
  return sampleIdentifier(s)?.value ?? ((s.certificate_number || '').trim() || 'Sample')
}
