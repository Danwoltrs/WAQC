/**
 * What a duplicated shipment sample takes from its source.
 *
 * A copy exists for the next container of the same contract (Anderson's
 * review, 2026-09-28: one contract shipped in five containers is five copies).
 * So it copies EVERYTHING that describes the lot and its contract — parties,
 * quality, every contract reference and link, the ICO, the exporter sample
 * number, the shipment month and the quantity — EXCEPT the container number,
 * which starts blank because each container has its own. The ICO is copied
 * and stays editable: containers of one contract usually share all of it but
 * the last segment, which the ICO inputs put the cursor on.
 *
 * Lab results, decisions, print and storage state are never copied: a copy is
 * a new physical tin in the queue. Only columns the source row actually has
 * are written, so a column missing on the live database is never named.
 *
 * History: 2026-09-15 (fa9da05) copies kept their contract links; 2026-09-23
 * everything but the container; 2026-09-25 (9cfd8c60) the parties, quality
 * and packaging only, every reference blank. This restores the 09-23 rule and
 * extends it to the contract links, references and quantity.
 */
import {
  BULK_CONTAINER_KG,
  bulkQuantitiesFromContainers,
  computeBagQuantities,
} from '@/lib/bag-quantity'

/** Copied from the source, as stored. */
export const DUPLICATE_COPIED_FIELDS = [
  // Lab and type
  'laboratory_id', 'sample_type', 'sample_category',
  // Parties
  'client_id', 'seller_id', 'exporter_id', 'same_seller_shipper', 'importer_is_qc_client',
  'importer_id', 'roaster_id', 'end_client_id', 'supplier', 'supplier_type', 'hide_exporter_on_label',
  'exporter_legacy', 'importer_legacy', 'roaster_legacy',
  // Quality
  'origin', 'micro_origin', 'processing_method', 'quality_spec_id', 'quality_name', 'crop_year', 'certifications',
  // Contract links and references
  'contract_id', 'linked_pss_sample_id', 'wolthers_contract_nr', 'contract_number',
  'seller_contract_nr', 'shipper_contract_nr', 'exporter_contract_nr', 'buyer_contract_nr',
  'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr', 'supplier_contract_nr',
  'manual_ref_fields',
  // Lot identifiers
  'ico_number', 'ico_marks', 'exporter_sample_number', 'shipment_month', 'destination',
  // Quantity
  'bag_type', 'bag_weight_kg', 'bag_count', 'bags', 'bags_quantity_mt', 'equivalent_60kg_bags', 'container_count',
  'container_size', 'bag_liner',
] as const

/** Written blank on every copy: each container has its own number. */
export const DUPLICATE_BLANK_FIELDS = ['container_nr', 'container'] as const

/** One bulk sample is one container: 360 × 60 kg equivalents (21.6 MT) at most. */
export const DUPLICATE_BULK_MAX_EQUIVALENTS = 360

/**
 * A quantity typed in the duplicate popover for every copy. Bags: a count.
 * Bulk: 60 kg bag equivalents in `bagCount` (the popover), or containers +
 * total MT (the older body shape, still accepted).
 */
export interface DuplicateQuantityOverride {
  bagCount: number | null
  containerCount: number | null
  bagsMt: number | null
}

export const NO_QUANTITY_OVERRIDE: DuplicateQuantityOverride = { bagCount: null, containerCount: null, bagsMt: null }

type Row = Record<string, unknown>

/** The quantity columns an override writes; empty when there is none (the copy keeps the source's). */
export function duplicateQuantity(source: Row, o: DuplicateQuantityOverride): Row {
  if (source.bag_type === 'bulk') {
    if (o.bagCount != null) {
      const q = computeBagQuantities(o.bagCount, BULK_CONTAINER_KG, 'bulk')
      return {
        bag_count: o.bagCount,
        bag_weight_kg: BULK_CONTAINER_KG,
        bags_quantity_mt: q.bags_quantity_mt,
        equivalent_60kg_bags: q.equivalent_60kg_bags,
        container_count: 1,
      }
    }
    if (o.containerCount != null || o.bagsMt != null) {
      return { ...bulkQuantitiesFromContainers(o.containerCount, o.bagsMt) }
    }
    return {}
  }
  if (o.bagCount != null) {
    const q = computeBagQuantities(o.bagCount, source.bag_weight_kg as number | null, source.bag_type as string)
    return { bag_count: o.bagCount, bags_quantity_mt: q.bags_quantity_mt, equivalent_60kg_bags: q.equivalent_60kg_bags }
  }
  return {}
}

/** Why an override cannot be applied to this source, or null. */
export function duplicateQuantityError(source: Row, o: DuplicateQuantityOverride): string | null {
  if (source.bag_type === 'bulk' && o.bagCount != null && o.bagCount > DUPLICATE_BULK_MAX_EQUIVALENTS) {
    return `Bulk is at most ${DUPLICATE_BULK_MAX_EQUIVALENTS} × 60 kg bag equivalents (21.6 MT) per sample`
  }
  return null
}

/** The copied columns of one duplicate (the caller adds its tracking number, status and author). */
export function buildDuplicateRow(source: Row, override: DuplicateQuantityOverride = NO_QUANTITY_OVERRIDE): Row {
  const row: Row = {}
  for (const field of DUPLICATE_COPIED_FIELDS) {
    if (field in source) row[field] = source[field]
  }
  for (const field of DUPLICATE_BLANK_FIELDS) {
    if (field in source) row[field] = null
  }
  row.container_nr = null
  return { ...row, ...duplicateQuantity(source, override) }
}
