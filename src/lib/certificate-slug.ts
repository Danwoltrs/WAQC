import { slugToTrackingNumber } from '@/lib/utils'

/**
 * Resolve a public certificate slug to a sample id.
 *
 * Tin sleeve QR codes encode the OFFICIAL certificate number. Tins printed
 * before that switch encode the internal tracking number, so both must resolve.
 * A sub-contract certificate number resolves to its mother sample, which is
 * correct: the tin belongs to the mother.
 *
 * Pass any Supabase client (service role or user-scoped).
 */
export async function resolveSampleIdForSlug(
  supabase: any,
  slug: string,
): Promise<string | null> {
  const reference = slugToTrackingNumber(slug)

  const { data: cert } = await supabase
    .from('certificates')
    .select('sample_id')
    .ilike('certificate_number', reference)
    .limit(1)
    .maybeSingle()
  if (cert?.sample_id) return cert.sample_id

  // Legacy path: tins printed before the QR switched to certificate numbers.
  const { data: sample } = await supabase
    .from('samples')
    .select('id')
    .ilike('tracking_number', reference)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  return sample?.id ?? null
}

export interface PublicReferenceSource {
  sampleType?: string | null
  containerNr?: string | null
  exporterSampleNumber?: string | null
  buyerContractNr?: string | null
  wolthersContractNr?: string | null
}

export interface PublicReference {
  reference: string
  eyebrow: string
}

/**
 * What the public certificate page is allowed to show.
 *
 * Never the internal SAN- lab number: it means nothing to an exporter or buyer
 * and invites them to quote it back at us. Shipment samples show their
 * container, pre-shipment samples the exporter's own sample number, and
 * anything else falls back to a contract reference.
 */
export function resolvePublicReference(src: PublicReferenceSource): PublicReference {
  const type = String(src.sampleType || '').toLowerCase()
  const container = (src.containerNr || '').trim()
  const exporterSample = (src.exporterSampleNumber || '').trim()

  if (type === 'ss' && container) return { reference: container, eyebrow: 'SS · Container' }
  if (type === 'pss' && exporterSample) return { reference: exporterSample, eyebrow: 'PSS · Exporter sample' }
  if (container) return { reference: container, eyebrow: 'Container' }
  if (exporterSample) return { reference: exporterSample, eyebrow: 'Exporter sample' }

  const contract = (src.buyerContractNr || '').trim() || (src.wolthersContractNr || '').trim()
  if (contract) return { reference: contract, eyebrow: 'Contract' }

  return { reference: 'Reference pending', eyebrow: '' }
}

/** A labelled value, or null when there is nothing to show. */
export interface LabelledReference {
  label: string
  value: string
}

/**
 * The physical lot's own identifier: the container for a shipment sample, the
 * exporter's sample number for a pre-shipment one.
 *
 * Separate from `resolvePublicReference` because the page leads with the
 * certificate number now and shows this below it, so it needs the plain label
 * ('Container') rather than the headline eyebrow ('SS · Container'). The
 * fallbacks match `resolvePublicReference` exactly, so the two never disagree
 * about which field identifies a lot.
 */
export function resolveLotReference(src: PublicReferenceSource): LabelledReference | null {
  const type = String(src.sampleType || '').toLowerCase()
  const container = (src.containerNr || '').trim()
  const exporterSample = (src.exporterSampleNumber || '').trim()

  if (type === 'ss' && container) return { label: 'Container', value: container }
  if (type === 'pss' && exporterSample) return { label: 'Exporter sample', value: exporterSample }
  if (container) return { label: 'Container', value: container }
  if (exporterSample) return { label: 'Exporter sample', value: exporterSample }
  return null
}

/**
 * The contract number a counterparty recognises.
 *
 * The buyer's own number wins. Ours is labelled as ours rather than passed off
 * as theirs — a buyer who reads "Contract 41922/26" and cannot find it in their
 * own system has been misled.
 */
export function resolveContractReference(src: PublicReferenceSource): LabelledReference | null {
  const buyer = (src.buyerContractNr || '').trim()
  if (buyer) return { label: 'Contract', value: buyer }
  const ours = (src.wolthersContractNr || '').trim()
  if (ours) return { label: 'W&A contract', value: ours }
  return null
}
