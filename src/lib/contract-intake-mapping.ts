// src/lib/contract-intake-mapping.ts
//
// Pure helpers used by the Contract Search step + /api/contracts/[id] endpoint
// to translate a public.contracts row + joined companies into prefill values
// for the sample intake form.

import type { FormData, SelectedContract } from '@/components/samples/intake/types'
import type { QualityMatch } from '@/lib/quality-matching'

export interface ContractCompany {
  id: string
  fantasy_name: string | null
  name: string | null
}

export interface ContractWithParties {
  id: string
  contract_number: string
  status: string
  contract_date: string | null
  crop: string | null
  volume_bags: number | null
  bag_type: string | null
  bag_weight_kg: number | string | null
  quality_description: string | null
  shipment_period_start: string | null
  shipment_period_end: string | null
  seller_reference: string | null
  buyer_reference: string | null
  certifications: unknown
  seller_id: string | null
  buyer_id: string
  shipper_id: string | null
  end_buyer_id: string | null
  seller: ContractCompany | null
  buyer: ContractCompany | null
  shipper: ContractCompany | null
  end_buyer: ContractCompany | null
}

export interface ContractResolution {
  resolved_client_id: string | null         // clients.id where company_id = contract.buyer_id
  importer_is_qc_client: boolean            // mirrors resolved client's is_qc_client
  resolved_importer_id: string | null       // importers.id matching buyer fantasy_name
  candidate_seller_exporter_ids: string[]   // exporters whose name matches the seller
  candidate_shipper_exporter_ids: string[]  // exporters whose name matches the shipper
  multiple_seller_matches: boolean
  multiple_shipper_matches: boolean
  resolved_quality_spec_id: string | null   // client_qualities.id of a high-confidence quality match, else null
  quality_match: QualityMatch | null         // full match detail for the UI hint (null when not computed)
}

/**
 * Map a `contracts.bag_type` string ("60kg Jute", "Bulk", "PP Bag", "Big Bag")
 * to the FormData bag_type enum used by the intake form.
 */
export function parseBagType(input: string | null | undefined): FormData['bag_type'] {
  if (!input) return ''
  const v = input.toLowerCase()
  // Check specific materials/containers before the generic "bag" fallback so a
  // "PP bag" / "big bag" isn't swallowed by the generic rule below.
  if (v.includes('bulk')) return 'bulk'
  if (v.includes('big')) return 'big_bag'
  if (/\bpp\b/.test(v) || v.includes('polypropylene')) return 'pp_bag'
  if (v.includes('jute')) return 'jute_bag'
  // Generic packaging wording with no explicit material — e.g. "BAGS OF 60 KG EACH",
  // "60 kg bag", "sacks" — defaults to jute, the standard coffee export bag.
  if (/\bbags?\b/.test(v) || v.includes('sack')) return 'jute_bag'
  return ''
}

/**
 * Pick the display name for a company: fantasy_name first, fall back to name.
 */
export function companyDisplayName(c: ContractCompany | null | undefined): string {
  if (!c) return ''
  return c.fantasy_name?.trim() || c.name?.trim() || ''
}

/**
 * Pick the legal name for a company: `name` first, fall back to fantasy_name.
 * Used for fields that are matched against companies.name at submit time
 * (seller/shipper) — the dropdown shows the fantasy name as the label.
 */
export function companyLegalName(c: ContractCompany | null | undefined): string {
  if (!c) return ''
  return c.name?.trim() || c.fantasy_name?.trim() || ''
}

// Contract shipper values that mean "no real shipper named yet" — treated as
// same-as-seller so the intake defaults to "= Shipper" checked.
const SHIPPER_PLACEHOLDERS = new Set([
  'tbi', 'tbn', 'tbd', 'tba', 'na', 'n/a', '-', '—',
  'to be informed', 'to be nominated', 'to be advised', 'to be determined',
])

function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim().toLowerCase().replace(/\./g, '')
  if (!n) return true
  return SHIPPER_PLACEHOLDERS.has(n)
}

/**
 * Normalize a contract's raw `certifications` (jsonb short codes) to WAQC's
 * canonical vocabulary. Pure. Shared by the intake mapping and the
 * /api/samples/[id]/contract-certifications endpoint.
 */
export function normalizeCertifications(raw: unknown): string[] {
  const knownCerts = ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR']
  const certMap: Record<string, string> = {
    ra: 'Rainforest Alliance', rainforest: 'Rainforest Alliance', rainforest_alliance: 'Rainforest Alliance', rfa: 'Rainforest Alliance',
    ft: 'Fair Trade', fairtrade: 'Fair Trade', fair_trade: 'Fair Trade',
    flo: 'FLO Fair Trade',
    organic: 'Organic', org: 'Organic',
    eudr: 'EUDR', eu_deforestation: 'EUDR',
  }
  if (!Array.isArray(raw)) return []
  const mapped = (raw as unknown[])
    .filter((x): x is string => typeof x === 'string')
    .map((s) => certMap[s.toLowerCase().replace(/[-\s]/g, '_')] ?? s)
    .filter((s) => knownCerts.includes(s))
  return [...new Set(mapped)]
}

/**
 * Build a SelectedContract from a fully joined contract row. Used by the badge.
 */
export function toSelectedContract(c: ContractWithParties): SelectedContract {
  return {
    id: c.id,
    contract_number: c.contract_number,
    seller_name: companyDisplayName(c.seller) || null,
    buyer_name: companyDisplayName(c.buyer) || null,
    shipper_name: companyDisplayName(c.shipper) || null,
    end_buyer_name: companyDisplayName(c.end_buyer) || null,
    crop: c.crop,
    volume_bags: c.volume_bags ?? null,
    bag_type: c.bag_type,
    shipment_period_start: c.shipment_period_start,
    quality_description: c.quality_description,
  }
}

/**
 * Build a partial FormData patch from a contract. Caller merges this onto existing
 * form state and tracks which keys were filled via the `prefilled` array.
 *
 * Bulk contracts intentionally skip bag_count / bags_quantity_mt — the user
 * enters the per-container value manually.
 */
export function mapContractToFormData(
  c: ContractWithParties,
  resolution: ContractResolution
): { patch: Partial<FormData>; prefilled: (keyof FormData)[] } {
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    patch[key] = value
    prefilled.push(key)
  }

  // Contract reference numbers
  set('wolthers_contract_nr', c.contract_number)
  if (c.seller_reference) set('seller_contract_nr', c.seller_reference)
  if (c.buyer_reference) set('importer_contract_nr', c.buyer_reference)

  // Seller — store the legal name so it matches both the dropdown option value
  // and the submit-time companies.name lookup; the dropdown shows the trade name.
  const sellerName = companyLegalName(c.seller)
  if (sellerName) set('seller', sellerName)

  // Shipper — default to "= Shipper" (shipper = seller) unless the contract names a
  // genuine, distinct shipper. A missing/placeholder shipper (T.B.I./TBN/TBD/…)
  // counts as "no distinct shipper".
  const shipperDistinct =
    !!c.shipper_id &&
    c.shipper_id !== c.seller_id &&
    !isPlaceholderName(c.shipper?.name ?? c.shipper?.fantasy_name)
  set('same_seller_shipper', !shipperDistinct)
  if (shipperDistinct) {
    const shipperName = companyLegalName(c.shipper)
    if (shipperName) set('shipper', shipperName)
  }

  // Importer (buyer)
  const buyerName = companyDisplayName(c.buyer)
  if (buyerName) set('importer', buyerName)
  set('importer_is_qc_client', resolution.importer_is_qc_client)
  if (resolution.resolved_client_id) {
    set('client_id', resolution.resolved_client_id)
  }

  // End client
  const endBuyerName = companyDisplayName(c.end_buyer)
  if (endBuyerName) set('end_client', endBuyerName)

  // Quality — keep the free-text label, and additionally pin the structured spec
  // when the server resolver found a confident match (so the dropdown preselects).
  if (c.quality_description) set('quality_name', c.quality_description)
  if (resolution.resolved_quality_spec_id) {
    set('quality_spec_id', resolution.resolved_quality_spec_id)
  }

  // Crop
  if (c.crop) set('crop_year', c.crop)

  // Quantity — skip bag_count / bags_quantity_mt for bulk
  const parsedBagType = parseBagType(c.bag_type)
  if (parsedBagType) set('bag_type', parsedBagType)
  if (c.bag_weight_kg != null) set('bag_weight_kg', String(c.bag_weight_kg))

  const isBulk = parsedBagType === 'bulk'
  if (!isBulk && c.volume_bags != null) {
    set('bag_count', String(c.volume_bags))
  }

  // Shipment month — YYYY-MM from shipment_period_start
  if (c.shipment_period_start) {
    set('shipment_month', c.shipment_period_start.slice(0, 7))
  }

  // Certifications — normalized via the shared helper (see normalizeCertifications).
  const certs = normalizeCertifications(c.certifications)
  if (certs.length > 0) set('certifications', certs)

  return { patch, prefilled }
}
