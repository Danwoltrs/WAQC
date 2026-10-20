/**
 * The full quality text of each sample's sys contract, for the bag sleeve.
 *
 * The contract is found the way the approval pipeline finds it (contract-
 * resolver): by the contract_id FK when it agrees with the sample's Wolthers
 * number, else by that number. Its text is what sys prints on the Sale
 * Confirmation (contract-quality-text). Every lookup is tolerant: a contract
 * the user cannot read or a missing link only means the sleeve falls back to
 * the quality template's text, never a failed print.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { acceptFkRow, contractLookup, pickContract } from '@/lib/approval-notification/contract-resolver'
import { contractQualityFullText, type CatalogueQuality } from '@/lib/contract-quality-text'
import { selectInChunks } from '@/lib/supabase-in-chunks'

export interface SleeveContractKeys {
  id: string
  contract_id?: string | null
  wolthers_contract_nr?: string | null
}

interface ContractRow {
  id: string
  contract_number: string | null
  status: string | null
  updated_at: string | null
  quality_description: string | null
  crop: string | null
  buyer_id: string | null
}

const CONTRACT_COLUMNS = 'id, contract_number, status, updated_at, quality_description, crop, buyer_id'

/** Sample id → the contract's full quality text; samples without one are absent. */
export async function loadSleeveContractQualities(
  supabase: SupabaseClient,
  samples: SleeveContractKeys[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    const keyed = samples.map(s => ({
      sample: s,
      lookup: contractLookup({ contract_id: s.contract_id ?? null, wolthers_contract_nr: s.wolthers_contract_nr ?? null }),
    }))
    const ids = [...new Set(keyed.filter(k => k.lookup?.column === 'id').map(k => k.lookup!.value))]
    const numbers = [...new Set(keyed.filter(k => k.lookup?.column === 'contract_number').map(k => k.lookup!.value))]
    if (ids.length === 0 && numbers.length === 0) return out

    const [byId, byNumber] = await Promise.all([
      ids.length
        ? selectInChunks<ContractRow>(ids, chunk =>
            (supabase as any).from('contracts').select(CONTRACT_COLUMNS).in('id', chunk))
        : Promise.resolve({ data: [] as ContractRow[], error: null }),
      numbers.length
        ? selectInChunks<ContractRow>(numbers, chunk =>
            (supabase as any).from('contracts').select(CONTRACT_COLUMNS).in('contract_number', chunk))
        : Promise.resolve({ data: [] as ContractRow[], error: null }),
    ])
    if (byId.error) console.warn('[bag-sleeve] contracts by id:', byId.error.message ?? byId.error)
    if (byNumber.error) console.warn('[bag-sleeve] contracts by number:', byNumber.error.message ?? byNumber.error)

    const rowById = new Map((byId.data ?? []).map(r => [r.id, r]))
    const rowsByNumber = new Map<string, ContractRow[]>()
    for (const r of byNumber.data ?? []) {
      const list = rowsByNumber.get(r.contract_number ?? '') ?? []
      list.push(r)
      rowsByNumber.set(r.contract_number ?? '', list)
    }

    const contractBySample = new Map<string, ContractRow>()
    for (const { sample, lookup } of keyed) {
      if (!lookup) continue
      const row = lookup.column === 'id'
        ? acceptFkRow(rowById.get(lookup.value), {
            contract_id: sample.contract_id ?? null,
            wolthers_contract_nr: sample.wolthers_contract_nr ?? null,
          })
        : pickContract(rowsByNumber.get(lookup.value) ?? [])
      if (row) contractBySample.set(sample.id, row)
    }
    if (contractBySample.size === 0) return out

    const contracts = [...new Map([...contractBySample.values()].map(c => [c.id, c])).values()]
    const buyerIds = [...new Set(contracts.map(c => c.buyer_id).filter((x): x is string => !!x))]

    // quality_sc_text is newer than this app's types: its own query, so its
    // absence costs only the legacy wording.
    const [scRows, catalogue] = await Promise.all([
      selectInChunks<{ id: string; quality_sc_text: string | null }>(contracts.map(c => c.id), chunk =>
        (supabase as any).from('contracts').select('id, quality_sc_text').in('id', chunk)),
      buyerIds.length
        ? selectInChunks<CatalogueQuality & { company_id: string }>(buyerIds, chunk =>
            (supabase as any)
              .from('company_qualities')
              .select('company_id, short_name, full_description')
              .in('company_id', chunk)
              .eq('is_active', true))
        : Promise.resolve({ data: [] as Array<CatalogueQuality & { company_id: string }>, error: null }),
    ])
    const scById = new Map((scRows.data ?? []).map(r => [r.id, r.quality_sc_text]))
    const catalogueByBuyer = new Map<string, CatalogueQuality[]>()
    for (const q of catalogue.data ?? []) {
      const list = catalogueByBuyer.get(q.company_id) ?? []
      list.push(q)
      catalogueByBuyer.set(q.company_id, list)
    }

    for (const [sampleId, c] of contractBySample) {
      const text = contractQualityFullText({
        description: c.quality_description,
        scText: scById.get(c.id) ?? null,
        qualities: c.buyer_id ? catalogueByBuyer.get(c.buyer_id) ?? [] : [],
        crop: c.crop,
      })
      if (text) out.set(sampleId, text)
    }
  } catch (err) {
    console.warn('[bag-sleeve] contract quality lookup failed:', err)
  }
  return out
}
