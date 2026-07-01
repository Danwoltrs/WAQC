/**
 * Per-split supply-side reference resolution for QC certificates.
 *
 * A mother `samples` row can serve several `sample_contracts` (commercial splits —
 * one per contract and/or container). Each split may carry its OWN seller (Ecom)
 * reference, shipper reference, and exporter sample number. When a certificate is
 * rendered for a specific split (`contractId`), it must show THAT split's supply-side
 * references, falling back to the mother sample only when the split leaves them blank.
 *
 * The seller/Ecom reference is entered per split through the sub-contract UI's
 * "Supplier" field (`supplier_contract_nr`); `seller_contract_nr` is the mother-level
 * field pulled from sys at intake. We therefore prefer `supplier_contract_nr`, then
 * `seller_contract_nr`, then the mother sample's `seller_contract_nr`.
 *
 * NOTE: `sample_contracts` has no per-split exporter contract column, so the exporter
 * entity keeps the mother `exporter_contract_nr` (resolved separately). We only route
 * the fields that actually have per-split columns through here to avoid printing a
 * duplicate "Ref:" line when seller and exporter merge into one column.
 */

export interface SupplyRefSample {
  seller_contract_nr?: string | null
  shipper_contract_nr?: string | null
  exporter_sample_number?: string | null
}

export interface SupplyRefContract {
  supplier_contract_nr?: string | null
  seller_contract_nr?: string | null
  shipper_contract_nr?: string | null
  exporter_sample_number?: string | null
}

export interface ResolvedSupplyRefs {
  /** Seller / Ecom "Ref:" shown on the cert's supply-side column. */
  sellerContract: string | null
  /** Shipper "Ref:" (when the shipper is a distinct column). */
  shipperContract: string | null
  /** The un-prefixed "Sample <n>" line attached to the seller column. */
  exporterSampleNumber: string | null
}

/** First non-empty (trimmed) value, or null. */
function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v
  }
  return null
}

/**
 * Resolve the supply-side references for a certificate. Pass `contract` = the split's
 * `sample_contracts` row when rendering a sub-contract cert; pass null/undefined for
 * a mother-sample cert (then every value comes from the mother sample — no behavior
 * change from the pre-fix path).
 */
export function resolveSupplyRefs(input: {
  sample: SupplyRefSample
  contract?: SupplyRefContract | null
}): ResolvedSupplyRefs {
  const { sample, contract } = input
  return {
    sellerContract: firstNonEmpty(
      contract?.supplier_contract_nr,
      contract?.seller_contract_nr,
      sample.seller_contract_nr,
    ),
    shipperContract: firstNonEmpty(
      contract?.shipper_contract_nr,
      sample.shipper_contract_nr,
    ),
    exporterSampleNumber: firstNonEmpty(
      contract?.exporter_sample_number,
      sample.exporter_sample_number,
    ),
  }
}
