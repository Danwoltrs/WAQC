// src/lib/approval-notification/contract-resolver.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SampleContractKeys {
  contract_id: string | null
  wolthers_contract_nr: string | null
}

export interface ContractContext {
  contractId: string
  buyerId: string | null
  sellerId: string | null
  buyerReference: string | null
  sellerReference: string | null
  contractNumber: string | null
}

export interface ContractLookup {
  column: 'id' | 'contract_number'
  value: string
}

/** Decide how to find the contract: by FK if set, else by the wolthers number. */
export function contractLookup(sample: SampleContractKeys): ContractLookup | null {
  if (sample.contract_id) return { column: 'id', value: sample.contract_id }
  if (sample.wolthers_contract_nr) {
    return { column: 'contract_number', value: sample.wolthers_contract_nr }
  }
  return null
}

/** Deterministically pick one contract when a number match returns several. */
export function pickContract<T extends { id: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]
  return [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]
}

interface ContractRow {
  id: string
  contract_number: string | null
  buyer_id: string | null
  seller_id: string | null
  buyer_reference: string | null
  seller_reference: string | null
}

/** Resolve full contract context for a sample, or null when there is no contract. */
export async function resolveSampleContract(
  admin: SupabaseClient,
  sample: SampleContractKeys,
): Promise<ContractContext | null> {
  const lookup = contractLookup(sample)
  if (!lookup) return null
  const { data } = await admin
    .from('contracts')
    .select('id, contract_number, buyer_id, seller_id, buyer_reference, seller_reference')
    .eq(lookup.column, lookup.value)
  const row = pickContract((data ?? []) as ContractRow[])
  if (!row) return null
  return {
    contractId: row.id,
    buyerId: row.buyer_id ?? null,
    sellerId: row.seller_id ?? null,
    buyerReference: row.buyer_reference ?? null,
    sellerReference: row.seller_reference ?? null,
    contractNumber: row.contract_number ?? null,
  }
}
