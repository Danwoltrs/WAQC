// src/lib/contract-intake-mapping.ts
//
// Pure helpers used by the Contract Search step + /api/contracts/[id] endpoint
// to translate a public.contracts row + joined companies into prefill values
// for the sample intake form.

import type { FormData, SelectedContract } from '@/components/samples/intake/types'

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
  volume_bags: number
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
}

/**
 * Map a `contracts.bag_type` string ("60kg Jute", "Bulk", "PP Bag", "Big Bag")
 * to the FormData bag_type enum used by the intake form.
 */
export function parseBagType(input: string | null | undefined): FormData['bag_type'] {
  if (!input) return ''
  const v = input.toLowerCase()
  if (v.includes('jute')) return 'jute_bag'
  if (v.includes('pp')) return 'pp_bag'
  if (v.includes('big')) return 'big_bag'
  if (v.includes('bulk')) return 'bulk'
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

  // Seller / shipper
  const sellerName = companyDisplayName(c.seller)
  if (sellerName) set('seller', sellerName)

  const sameSellerShipper = !c.shipper_id || c.shipper_id === c.seller_id
  set('same_seller_shipper', sameSellerShipper)
  if (!sameSellerShipper) {
    const shipperName = companyDisplayName(c.shipper)
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

  // Quality
  if (c.quality_description) set('quality_name', c.quality_description)

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

  // Certifications — pass through known values only
  const knownCerts = ['Rainforest Alliance', 'Fair Trade', 'FLO Fair Trade', 'Organic', 'EUDR']
  const certMap: Record<string, string> = {
    eudr: 'EUDR',
    rfa: 'Rainforest Alliance',
    fairtrade: 'Fair Trade',
    flo: 'FLO Fair Trade',
    organic: 'Organic',
  }
  if (Array.isArray(c.certifications)) {
    const mapped = (c.certifications as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .map(s => certMap[s.toLowerCase()] ?? s)
      .filter(s => knownCerts.includes(s))
    if (mapped.length > 0) set('certifications', mapped)
  }

  return { patch, prefilled }
}
