/**
 * What the bag sleeve label prints.
 *
 * Never samples.tracking_number (the internal SAN- key). The sleeve leads with
 * the buyer's contract number; a lot with none (a stocklot, a type sample)
 * leads with its sample number, then its container, then its ICO, then the
 * certificate number, then a neutral word. The sample number otherwise rides
 * on the type line ("PSS - 123453"), and the buyer number is not repeated in
 * the contract refs under the date (2026-10-20).
 */
import { sampleIdentifier } from '@/lib/sample-reference'

const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const norm = (v: unknown): string => str(v).replace(/\.$/, '').toLowerCase()

export function bagSleeveHeadline(s: {
  buyer_contract_nr?: string | null
  container_nr?: string | null
  ico_number?: string | null
  exporter_sample_number?: string | null
  certificate_number?: string | null
}): string {
  return str(s.buyer_contract_nr)
    || str(s.exporter_sample_number)
    || sampleIdentifier(s)?.value
    || str(s.certificate_number)
    || 'Sample'
}

/** "PSS", or "PSS - 123453" when the sample number is not already the headline. */
export function bagSleeveTypeLine(type: string, sampleNumber: string | null | undefined, headline: string): string {
  const n = str(sampleNumber)
  return n && n !== headline ? `${type} - ${n}` : type
}

/** The contract refs printed under the date, minus the buyer's: it is the headline. */
export function bagSleeveContracts(s: {
  wolthers_contract_nr?: string | null
  buyer_contract_nr?: string | null
  exporter_contract_nr?: string | null
  roaster_contract_nr?: string | null
}, headline: string): Array<{ type: string; value: string }> {
  const refs: Array<{ type: string; value: string | null | undefined }> = [
    { type: 'Wolthers', value: s.wolthers_contract_nr },
    { type: 'Importer', value: s.buyer_contract_nr },
    { type: 'Exporter', value: s.exporter_contract_nr },
    { type: 'Roaster', value: s.roaster_contract_nr },
  ]
  return refs
    .map(r => ({ type: r.type, value: str(r.value) }))
    .filter(r => r.value && !(r.type === 'Importer' && r.value === headline))
}

/**
 * The full quality text under the bold short name: the contract's own, else
 * the quality template's description, else its name. Null when it would only
 * repeat the short name.
 */
export function bagSleeveQualityDescription(q: {
  contract_text?: string | null
  template_description?: string | null
  template_name?: string | null
  short_name?: string | null
}): string | null {
  const text = str(q.contract_text) || str(q.template_description) || str(q.template_name)
  if (!text || text === 'N/A') return null
  return norm(text) === norm(q.short_name) ? null : text
}
