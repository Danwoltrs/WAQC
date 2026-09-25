import {
  companyDisplayName,
  mapContractToSampleEdit,
  type ContractWithParties,
} from '@/lib/contract-intake-mapping'

/** What a pick filled, for the host to tell the user before they save. */
export interface ContractPickResult {
  /** The buyer set as importer, when the contract names one. */
  buyer: string | null
  /** The seller set on a sample that stands alone. */
  seller: string | null
  /** The contract's seller when a lot with other contracts keeps its own. */
  sellerKept: string | null
}

/**
 * Loads a contract picked in the sample editor (the search row carries names
 * only; the parties are needed by id) and applies the edits it makes, see
 * mapContractToSampleEdit, through `apply`: the host's own setter, the
 * editor's draft for the info strip, the panel's form for the details panel.
 * Throws, applying nothing, when the contract cannot be loaded.
 */
export async function applyPickedContract(
  contractId: string,
  current: { client_id?: string | null; seller_id?: string | null },
  opts: { standalone: boolean },
  apply: (field: string, value: string | boolean) => void,
): Promise<ContractPickResult> {
  const res = await fetch(`/api/contracts/${contractId}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body?.contract) throw new Error(body?.error || 'Could not load the contract')
  const c = body.contract as ContractWithParties
  const { fields, sellerKept } = mapContractToSampleEdit(c, current, opts)
  for (const [field, value] of Object.entries(fields)) apply(field, value)
  return {
    buyer: 'importer_id' in fields ? companyDisplayName(c.buyer) || null : null,
    seller: 'seller_id' in fields ? companyDisplayName(c.seller) || null : null,
    sellerKept,
  }
}
