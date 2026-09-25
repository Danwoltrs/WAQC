import type { FormData, SubContractFormData } from '@/components/samples/intake/types'

// A linked PSS prefills an SS with every shared contract/quality/quantity field.
// Input is the flattened sample shape returned by GET /api/samples (raw samples.*
// columns + flattened *_name entity labels). A contract sibling arrives through
// siblingAsSample (pss-picker-option.ts) in that same shape, carrying its own
// buy side, references and quantity over the lot the group shares, so one
// mapper serves the lab unit and every sibling alike. Unlike contracts (which
// store short cert codes), a WAQC sample's certifications are already in WAQC
// vocabulary, so they pass through unchanged.
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
  // The Wolthers contract number travels with the PSS (restored 2026-09-16).
  // It was dropped on 2026-09-10 because an SS inherited it SILENTLY and kept
  // it when the shipment moved to another contract; since then the number sits
  // in a visible field that searches as you type, and a corrected number drops
  // the contract link at submit (isStaleContractLink), so the inheritance is
  // no longer silent. The form layers the PSS's own contract link on top of
  // this number (sample-intake-form.tsx, handleSelectPss).
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
  setStr('container_count', pss.container_count) // bulk only; blank on a bag lot
  setStr('shipment_month', pss.shipment_month)

  return { patch, prefilled }
}

const text = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v))

/**
 * One proposed contract row for the SS from a sibling of the linked PSS (the
 * sibling as siblingAsSample returns it). A PSS that covers several contracts
 * is a lab unit plus siblings; an SS linked to the lab unit covers the same
 * contracts, so each sibling becomes a row carrying its own buy side,
 * references and quantity, pointing back at that sibling as the PSS it ships
 * against. Every field is filled, blanks included, so nothing of the mother
 * form leaks into a contract that does not have it.
 *
 * The row's seller-ref box (supplier_contract_nr on a contract row) takes the
 * sibling's seller_contract_nr: that is what its certificate prints and what
 * the sample editor changes, and the two columns can drift apart. The
 * sibling's supplier_contract_nr is only the fallback for a blank seller ref.
 */
export function mapSiblingToContractRow(sibling: any): SubContractFormData {
  return {
    importer: text(sibling.importer_name),
    importer_is_qc_client: sibling.importer_is_qc_client ?? true,
    roaster: text(sibling.roaster_name),
    end_client: text(sibling.end_client_name),
    qc_client: text(sibling.qc_client_name),
    wolthers_contract_nr: text(sibling.wolthers_contract_nr),
    contract_id: text(sibling.contract_id),
    buyer_contract_nr: text(sibling.buyer_contract_nr),
    roaster_contract_nr: text(sibling.roaster_contract_nr),
    qc_client_contract_nr: text(sibling.qc_client_contract_nr),
    end_client_contract_nr: text(sibling.end_client_contract_nr),
    supplier_contract_nr: text(sibling.seller_contract_nr) || text(sibling.supplier_contract_nr),
    ico_number: text(sibling.ico_number),
    container_nr: text(sibling.container_nr),
    bag_count: text(sibling.bag_count),
    bag_weight_kg: text(sibling.bag_weight_kg),
    bag_type: (sibling.bag_type as SubContractFormData['bag_type']) || '',
    bags_quantity_mt: text(sibling.bags_quantity_mt),
    equivalent_60kg_bags: text(sibling.equivalent_60kg_bags),
    container_count: text(sibling.container_count),
    shipment_month: text(sibling.shipment_month),
    exporter_sample_number: text(sibling.exporter_sample_number),
    proposed_from: 'pss',
    linked_pss_sample_id: text(sibling.id),
  }
}
