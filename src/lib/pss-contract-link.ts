import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * An SS ships against the contract its PSS was approved for: when a row names
 * a linked PSS and no contract, it is filed on the PSS's own `contract_id`.
 *
 * Taken from the PSS row directly, never re-resolved by number: sys keeps a
 * split family under ONE shared `contracts.contract_number` (42089/26A, /26B,
 * /26C differ only by `split_suffix`), so any lookup by number lands on the
 * family — mother first — instead of the sub-contract. A row that carries its
 * own `contract_id` keeps it: an explicit relink is the user's decision and
 * wins over inheritance.
 */
export interface PssLinkedRow {
  linked_pss_sample_id?: string | null
  contract_id?: string | null
}

export async function fillContractIdFromLinkedPss<T extends PssLinkedRow>(
  db: SupabaseClient<any>,
  rows: T[],
): Promise<T[]> {
  const wanted = [...new Set(rows
    .filter((r) => !r.contract_id && r.linked_pss_sample_id)
    .map((r) => r.linked_pss_sample_id as string))]
  if (wanted.length === 0) return rows
  const { data, error } = await db
    .from('samples')
    .select('id, contract_id')
    .in('id', wanted)
  if (error) throw error
  const contractByPss = new Map<string, string>()
  for (const s of (data ?? []) as Array<{ id: string; contract_id: string | null }>) {
    if (s.contract_id) contractByPss.set(s.id, s.contract_id)
  }
  return rows.map((r) => {
    if (r.contract_id || !r.linked_pss_sample_id) return r
    const contractId = contractByPss.get(r.linked_pss_sample_id)
    return contractId ? { ...r, contract_id: contractId } : r
  })
}
