import type { FormData } from '@/components/samples/intake/types'

// A linked PSS prefills an SS with every shared contract/quality/quantity field.
// Input is the flattened sample shape returned by GET /api/samples (raw samples.*
// columns + flattened *_name entity labels). Unlike contracts (which store short
// cert codes), a WAQC sample's certifications are already in WAQC vocabulary, so
// they pass through unchanged.
export function mapPssToFormData(
  pss: any
): { patch: Partial<FormData>; prefilled: (keyof FormData)[] } {
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    patch[key] = value
    prefilled.push(key)
  }
  // String-coercing setter that skips null/undefined/empty so they don't count as prefilled.
  const setStr = <K extends keyof FormData>(key: K, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      set(key, String(value) as FormData[K])
    }
  }

  const sameShipper = pss.same_seller_shipper ?? true
  const importerIsQc = pss.importer_is_qc_client ?? true

  // Legal-name helper: prefers the legal `name` column over fantasy_name so that
  // seller/shipper values match the dropdown options and the submit-time ilike
  // lookup against companies.name (which uses the legal name, not fantasy).
  // The GET /api/samples response provides *_legal_name fields for exactly this purpose.
  const legalName = (legal: unknown, display: unknown) =>
    (legal as string | null | undefined) ?? (display as string | null | undefined)

  // Counterparties — seller/shipper use legal name; importer/roaster/end_client/qc_client
  // stay on the display (fantasy-preferring) *_name field because their dropdowns and
  // submit-time lookups use the display name.
  setStr('seller', legalName(pss.seller_legal_name, pss.seller_name))
  set('same_seller_shipper', sameShipper)
  if (!sameShipper) setStr('shipper', legalName(pss.exporter_legal_name, pss.exporter_name))
  setStr('importer', pss.importer_name)
  set('importer_is_qc_client', importerIsQc)
  if (pss.client_id) setStr('client_id', pss.client_id)
  if (!importerIsQc) setStr('qc_client', pss.qc_client_name)
  setStr('roaster', pss.roaster_name)
  setStr('end_client', pss.end_client_name)

  // Contract references (DB column buyer_contract_nr maps to form importer_contract_nr)
  setStr('seller_contract_nr', pss.seller_contract_nr)
  setStr('shipper_contract_nr', pss.shipper_contract_nr)
  setStr('exporter_contract_nr', pss.exporter_contract_nr)
  setStr('importer_contract_nr', pss.buyer_contract_nr)
  setStr('roaster_contract_nr', pss.roaster_contract_nr)
  setStr('qc_client_contract_nr', pss.qc_client_contract_nr)
  setStr('end_client_contract_nr', pss.end_client_contract_nr)
  setStr('wolthers_contract_nr', pss.wolthers_contract_nr)

  // Identifiers
  setStr('exporter_sample_number', pss.exporter_sample_number)
  setStr('ico_number', pss.ico_number)
  setStr('container_nr', pss.container_nr) // usually blank on a PSS

  // Quality
  setStr('quality_spec_id', pss.quality_spec_id)
  setStr('quality_name', pss.quality_name)
  setStr('origin', pss.origin)
  setStr('micro_origin', pss.micro_origin)
  setStr('processing_method', pss.processing_method)
  if (Array.isArray(pss.certifications) && pss.certifications.length > 0) {
    set(
      'certifications',
      pss.certifications.filter((c: unknown): c is string => typeof c === 'string')
    )
  }
  setStr('crop_year', pss.crop_year)

  // Quantity (editable afterward; bag_count skipped for bulk)
  const bagType = pss.bag_type as FormData['bag_type']
  if (bagType) set('bag_type', bagType)
  setStr('bag_weight_kg', pss.bag_weight_kg)
  if (bagType !== 'bulk') setStr('bag_count', pss.bag_count)
  setStr('bags_quantity_mt', pss.bags_quantity_mt)
  setStr('equivalent_60kg_bags', pss.equivalent_60kg_bags)
  setStr('shipment_month', pss.shipment_month)

  return { patch, prefilled }
}

// A sub-contract (container/buyer split of a PSS) overrides only the per-leaf
// fields; everything else (seller, quality, origin, bag type, crop year) inherits
// from the mother via mapPssToFormData. Input is a sub_contracts[] element from
// GET /api/samples (entity names already resolved to display names).
export function mapSubContractOverride(
  sc: any
): { patch: Partial<FormData>; prefilled: (keyof FormData)[] } {
  const patch: Partial<FormData> = {}
  const prefilled: (keyof FormData)[] = []

  const setStr = <K extends keyof FormData>(key: K, value: unknown) => {
    if (value !== null && value !== undefined && value !== '') {
      patch[key] = String(value) as FormData[K]
      prefilled.push(key)
    }
  }

  setStr('importer', sc.importer_name)
  setStr('roaster', sc.roaster_name)
  setStr('end_client', sc.end_client_name)
  setStr('qc_client', sc.qc_client_name)
  setStr('importer_contract_nr', sc.buyer_contract_nr)
  setStr('roaster_contract_nr', sc.roaster_contract_nr)
  setStr('end_client_contract_nr', sc.end_client_contract_nr)
  setStr('qc_client_contract_nr', sc.qc_client_contract_nr)
  setStr('supplier_contract_nr', sc.supplier_contract_nr)
  setStr('wolthers_contract_nr', sc.wolthers_contract_nr)
  setStr('ico_number', sc.ico_number)
  setStr('container_nr', sc.container_nr)
  setStr('bags_quantity_mt', sc.bags_quantity_mt)

  return { patch, prefilled }
}
