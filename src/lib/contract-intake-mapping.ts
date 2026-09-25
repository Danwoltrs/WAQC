// src/lib/contract-intake-mapping.ts
//
// Pure helpers used by the Contract Search step + /api/contracts/[id] endpoint
// to translate a public.contracts row + joined companies into prefill values
// for the sample intake form.

import type { FormData, SelectedContract, SubContractFormData } from '@/components/samples/intake/types'
import { contractDisplayNumber, type ContractFamilyContract, type ContractFamilyMember } from '@/lib/contract-family'
import type { QualityMatch } from '@/lib/quality-matching'

export interface ContractCompany {
  id: string
  fantasy_name: string | null
  name: string | null
}

export interface ContractWithParties {
  id: string
  contract_number: string
  /** Family letter after the year for a same-parties split (42089/26B); null otherwise. */
  split_suffix?: string | null
  parent_contract_id?: string | null
  /** Active contracts of the same sys family — see contract-family.ts. Set by /api/contracts/[id]. */
  family?: ContractFamilyMember<ContractFamilyContract>[]
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
    split_suffix: c.split_suffix ?? null,
    seller_name: companyDisplayName(c.seller) || null,
    buyer_name: companyDisplayName(c.buyer) || null,
    shipper_name: companyDisplayName(c.shipper) || null,
    end_buyer_name: companyDisplayName(c.end_buyer) || null,
    seller_id: c.seller_id ?? null,
    seller_legal_name: companyLegalName(c.seller) || null,
    shipper_id: c.shipper_id ?? null,
    shipper_legal_name: companyLegalName(c.shipper) || null,
    buyer_id: c.buyer_id ?? null,
    buyer_legal_name: companyLegalName(c.buyer) || null,
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

  // Contract reference numbers. The Wolthers number is the contract's own,
  // printed as sys prints it (a split child keeps its suffix: 42089/26B). It
  // was left out from 2026-09-10 to 2026-09-17 because a picked contract used
  // to write it SILENTLY; today it lands in a visible field that searches as
  // you type, an edit claims it (updateFormData drops it from the prefilled
  // set) and a corrected number drops the link at submit (isStaleContractLink),
  // so filling it costs nothing that retyping would have caught.
  set('wolthers_contract_nr', contractDisplayNumber(c))
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

/**
 * Build the patch for one added contract of a lot (a sibling) from the sys
 * contract its typed number found. Only what the contract owns is filled — its
 * link, buyer, both references, end client, quantity and shipment month — and
 * only where the contract carries a value, so a blank on sys never wipes what
 * was typed. Seller, quality, crop and certifications belong to the whole lot
 * and are not touched (see MOTHER_SHARED_FIELDS in src/lib/sample-group.ts).
 *
 * The bag weight is left to the panel: its bag-type effect sets the standard
 * weight whenever the type changes, so a weight written here would not stick.
 * `keepQcClient` leaves the QC-client flag alone where the host locks it.
 */
export function mapContractToSubContract(
  c: ContractWithParties,
  resolution: ContractResolution,
  opts: { keepQcClient?: boolean } = {},
): Partial<SubContractFormData> {
  const patch: Partial<SubContractFormData> = { contract_id: c.id }

  const buyerName = companyDisplayName(c.buyer)
  if (buyerName) patch.importer = buyerName
  if (!opts.keepQcClient) patch.importer_is_qc_client = resolution.importer_is_qc_client

  if (c.buyer_reference) patch.buyer_contract_nr = c.buyer_reference
  // A sibling's seller reference travels as supplier_contract_nr and is the
  // contract's own (buildSiblingRow: supplier ref → seller ref, no lab-unit
  // fallback). A contract with no seller reference on sys leaves the box as
  // typed, blank for a new row.
  if (c.seller_reference) patch.supplier_contract_nr = c.seller_reference

  const endBuyerName = companyDisplayName(c.end_buyer)
  if (endBuyerName) patch.end_client = endBuyerName

  const bagType = parseBagType(c.bag_type)
  if (bagType) patch.bag_type = bagType
  if (bagType !== 'bulk' && c.volume_bags != null) patch.bag_count = String(c.volume_bags)

  if (c.shipment_period_start) patch.shipment_month = c.shipment_period_start.slice(0, 7)

  return patch
}

/**
 * The edits a sys contract picked in the sample editor makes to an existing
 * sample, as sample columns: its number printed with the split letter (the
 * contract link follows it on save), both references, the buyer, the end
 * client and the shipment month. On a sample that stands alone (every SS) the
 * seller and shipper too; a lot with other contracts keeps its seller, which
 * they all share, and `sellerKept` names the contract's when it differs.
 *
 * Only what the contract carries is filled, so a blank on sys never wipes a
 * value. The QC client is never touched: it picks the sample's
 * certificate-number line, and a contract's buyer is not always the QC
 * client. Neither are the quantity, packaging, quality or lot references.
 */
export function mapContractToSampleEdit(
  c: ContractWithParties,
  sample: { client_id?: string | null; seller_id?: string | null },
  opts: { standalone: boolean },
): { fields: Record<string, string | boolean>; sellerKept: string | null } {
  const fields: Record<string, string | boolean> = { wolthers_contract_nr: contractDisplayNumber(c) }
  const sellerRef = c.seller_reference?.trim()
  if (sellerRef) fields.seller_contract_nr = sellerRef
  const buyerRef = c.buyer_reference?.trim()
  if (buyerRef) fields.buyer_contract_nr = buyerRef
  if (c.buyer_id) {
    fields.importer_id = c.buyer_id
    fields.importer_is_qc_client = c.buyer_id === sample.client_id
  }
  if (c.end_buyer_id) fields.end_client_id = c.end_buyer_id
  if (c.shipment_period_start) fields.shipment_month = c.shipment_period_start.slice(0, 7)

  let sellerKept: string | null = null
  if (c.seller_id) {
    if (opts.standalone) {
      // Same rule as intake: a missing or placeholder shipper ships as the
      // seller, and then the exporter IS the seller.
      const shipperDistinct =
        !!c.shipper_id &&
        c.shipper_id !== c.seller_id &&
        !isPlaceholderName(c.shipper?.name ?? c.shipper?.fantasy_name)
      fields.seller_id = c.seller_id
      fields.exporter_id = shipperDistinct ? (c.shipper_id as string) : c.seller_id
      fields.same_seller_shipper = !shipperDistinct
    } else if (sample.seller_id && sample.seller_id !== c.seller_id) {
      sellerKept = companyDisplayName(c.seller) || null
    }
  }
  return { fields, sellerKept }
}

const sameName = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * The contract's seller when it is not the lot's seller, else null. The seller
 * is shared by every contract of a lot, so an added contract never changes it;
 * the panel shows this so a mismatch is seen instead of silently saved.
 * Unknown on either side is not a mismatch.
 */
export function contractSellerDiffers(
  c: ContractWithParties,
  lotSellerName: string | null | undefined,
): string | null {
  const lot = sameName(lotSellerName)
  if (!lot || !c.seller) return null
  const names = [c.seller.name, c.seller.fantasy_name].map(sameName).filter(Boolean)
  if (names.length === 0 || names.includes(lot)) return null
  return companyDisplayName(c.seller)
}

/** Shown under a seller-ref box that holds the importer's ref. */
export const SELLER_REF_IS_IMPORTER_REF_WARNING = 'Seller ref and importer ref are the same. Each belongs in its own box.'

/**
 * True when a contract's seller ref and importer ref are one value (trimmed,
 * any case, both filled). Almost always one ref typed into both boxes: OFI
 * sells to OFI, so both boxes sit next to "OFI", and on 2026-08-13 the
 * importer's S049504-12 went into the seller slot of SAN-00752/26 and onto its
 * certificate. A warning, never a block.
 */
export function sellerRefIsImporterRef(
  sellerRef: string | null | undefined,
  importerRef: string | null | undefined,
): boolean {
  const seller = sameName(sellerRef)
  return seller !== '' && seller === sameName(importerRef)
}

/**
 * True when the typed Wolthers number no longer reads as the linked contract's.
 * The sys mirror resolves contract_id before the number, so a link left behind
 * by a corrected number would file the sample on the wrong contract. A blank
 * number does not contradict the link: a contract picked in Step 1 before any
 * number was typed stays linked. A split child reads as its bare number or as
 * the suffixed one sys prints (42089/26 or 42089/26B).
 */
export function isStaleContractLink(
  typedNumber: string,
  linkedNumber: string | null | undefined,
  linkedSuffix?: string | null,
): boolean {
  if (!linkedNumber) return false
  const typed = sameName(typedNumber)
  if (typed === '') return false
  const accepted = [sameName(linkedNumber), sameName(`${linkedNumber}${linkedSuffix ?? ''}`)]
  return !accepted.includes(typed)
}

/**
 * Whether a contract link filled everything Step 2 ("Supply chain and contract
 * references") exists to collect: the seller (and the shipper when it is not
 * the seller), the seller's and buyer's references, the importer and the
 * Wolthers number. When it did, the wizard skips the step; it stays one
 * "Previous" away for edits.
 */
export function isContractPrefillComplete(
  form: Pick<
    FormData,
    'seller' | 'same_seller_shipper' | 'shipper' | 'importer' | 'seller_contract_nr' | 'importer_contract_nr' | 'wolthers_contract_nr'
  >,
): boolean {
  const has = (v: string | null | undefined) => (v ?? '').trim() !== ''
  return (
    has(form.seller) &&
    (form.same_seller_shipper || has(form.shipper)) &&
    has(form.importer) &&
    has(form.seller_contract_nr) &&
    has(form.importer_contract_nr) &&
    has(form.wolthers_contract_nr)
  )
}

export interface LinkedPartyIds {
  seller_id: string | null
  /** The shipper: the seller's id when =Shipper is ticked. */
  exporter_id: string | null
  importer_id: string | null
}

const readsAs = (value: string | null | undefined, ...names: Array<string | null | undefined>): boolean => {
  const v = sameName(value)
  return v !== '' && names.some((n) => sameName(n) === v)
}

/**
 * The company ids the linked contract already resolved, for the parties whose
 * form value still reads as the contract's (legal or trade name). A party the
 * user renamed comes back null and is found by name at submit as before, so
 * the ids never override an edit. The point: a seller absent from the exporter
 * dropdown (untagged on sys, or tagged under another spelling) still reaches
 * `samples.seller_id`, instead of an ilike that matched nothing.
 */
export function linkedPartyIds(
  form: Pick<FormData, 'selected_contract' | 'seller' | 'same_seller_shipper' | 'shipper' | 'importer'>,
): LinkedPartyIds {
  const sc = form.selected_contract
  if (!sc) return { seller_id: null, exporter_id: null, importer_id: null }
  const seller_id = readsAs(form.seller, sc.seller_legal_name, sc.seller_name) ? sc.seller_id : null
  const exporter_id = form.same_seller_shipper
    ? seller_id
    : readsAs(form.shipper, sc.shipper_legal_name, sc.shipper_name) ? sc.shipper_id : null
  const importer_id = readsAs(form.importer, sc.buyer_legal_name, sc.buyer_name) ? sc.buyer_id : null
  return { seller_id, exporter_id, importer_id }
}
