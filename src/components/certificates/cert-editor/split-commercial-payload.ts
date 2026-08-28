/**
 * Route a certificate editor's commercial edits to the row that owns them.
 *
 * A sample covering several contracts is one `samples` row (the mother) plus a
 * `sample_contracts` row per extra contract, each with its own certificate.
 * The editor loads a sub-contract cert with `?contract_id=` (so it shows THAT
 * contract's bags and references) but used to save every field to the mother —
 * so changing the bags on one contract's certificate rewrote the mother, and
 * every sibling certificate that was reading the mother's values changed with
 * it. The fields `sample_contracts` stores per contract must be PATCHed there.
 *
 * Everything else (quality spec, processing, crop year, parties shared by the
 * whole lot) stays on the mother, which is shared by design.
 */
export const SUB_CONTRACT_OWNED_FIELDS: ReadonlySet<string> = new Set([
  'wolthers_contract_nr', 'seller_contract_nr', 'shipper_contract_nr',
  'buyer_contract_nr', 'roaster_contract_nr', 'qc_client_contract_nr',
  'end_client_contract_nr', 'supplier_contract_nr', 'ico_number', 'container_nr',
  'importer_id', 'importer_is_qc_client', 'roaster_id', 'end_client_id',
  'bag_count', 'bag_weight_kg', 'bag_type', 'bags_quantity_mt',
  'equivalent_60kg_bags', 'exporter_sample_number', 'shipment_month',
])

export interface SplitPayload {
  /** Fields to PATCH on the sub-contract row (empty when there is no contract). */
  contractPatch: Record<string, unknown>
  /** Fields to PATCH on the mother sample. */
  samplePatch: Record<string, unknown>
}

export function splitCommercialPayload(
  payload: Record<string, unknown>,
  contractId: string | null | undefined,
): SplitPayload {
  if (!contractId) return { contractPatch: {}, samplePatch: { ...payload } }
  const contractPatch: Record<string, unknown> = {}
  const samplePatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (SUB_CONTRACT_OWNED_FIELDS.has(k)) contractPatch[k] = v
    else samplePatch[k] = v
  }
  return { contractPatch, samplePatch }
}
