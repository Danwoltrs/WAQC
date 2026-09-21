import type { SupabaseClient } from '@supabase/supabase-js'
import { contractDisplayNumber } from '@/lib/contract-family'

/**
 * Which sys contract a Wolthers number links to — the rule intake applies,
 * reused when a number is corrected after intake. Left alone, a corrected
 * number kept the old `contract_id`: two contradicting keys, so the sys
 * mirror refused to file the sample (contract_key_conflict) and the
 * certificate could print another contract's references.
 *
 * sys keeps a split family under ONE shared contract_number that differs
 * only by split_suffix, printed after the year (42089/26B). So:
 *  - the printed number of exactly one live contract links that contract;
 *  - the family's bare number keeps the member the sample already sits on;
 *  - anything else (no live match, several with no current member) unlinks.
 */
export interface NumberedContract {
  id: string
  contract_number: string
  split_suffix?: string | null
  status?: string | null
}

const DEAD_STATUSES = new Set(['cancelled', 'washed_out'])
const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase()

/** The base number a printed member number carries (42089/26B → 42089/26), else null. */
export function baseNumberOf(typed: string): string | null {
  const m = typed.trim().match(/^(\d+\/\d{2})[A-Za-z]$/)
  return m ? m[1] : null
}

export function pickContractForNumber<T extends NumberedContract>(
  rows: T[],
  typed: string,
  currentId: string | null,
): { contractId: string | null; matches: T[] } {
  const wanted = norm(typed)
  const matches = rows.filter(
    (r) =>
      !DEAD_STATUSES.has((r.status ?? '').toLowerCase()) &&
      (norm(r.contract_number) === wanted || norm(contractDisplayNumber(r)) === wanted),
  )
  if (matches.length === 1) return { contractId: matches[0].id, matches }
  if (currentId && matches.some((r) => r.id === currentId)) return { contractId: currentId, matches }
  return { contractId: null, matches }
}

export async function resolveContractLinkForNumber(
  db: SupabaseClient<any>,
  typed: string,
  currentId: string | null,
): Promise<{ contractId: string | null; matches: NumberedContract[] }> {
  const numbers = [...new Set([typed.trim(), baseNumberOf(typed)].filter((v): v is string => !!v))]
  const { data, error } = await db
    .from('contracts')
    .select('id, contract_number, split_suffix, status')
    .in('contract_number', numbers)
  if (error) throw error
  return pickContractForNumber((data ?? []) as NumberedContract[], typed, currentId)
}
