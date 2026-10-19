/**
 * Headline for the bag sleeve label.
 *
 * Never samples.tracking_number (the internal SAN- key). The sleeve leads with
 * the lot's own identifier, by type: a PSS with the exporter's sample number,
 * then its container, then its ICO; an SS (and any other type) with its
 * container, then its ICO, then the exporter's sample number. Then the
 * certificate number, then a neutral word.
 */
import { sampleIdentifier } from '@/lib/sample-reference'

export function bagSleeveHeadline(s: {
  sample_type?: string | null
  container_nr?: string | null
  ico_number?: string | null
  exporter_sample_number?: string | null
  certificate_number?: string | null
}): string {
  const exporterSample = (s.exporter_sample_number || '').trim()
  const own = String(s.sample_type || '').toLowerCase() === 'pss' && exporterSample
    ? exporterSample
    : sampleIdentifier(s)?.value
  return own ?? ((s.certificate_number || '').trim() || 'Sample')
}
