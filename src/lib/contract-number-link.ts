import type { SupabaseClient } from '@supabase/supabase-js'
import { contractDisplayNumber } from '@/lib/contract-family'
import { fkAgreesWithNumber } from '@/lib/contract-ref-sync'

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

/**
 * The `contract_id` a new sample row may store beside its Wolthers number.
 *
 * Nobody sees the link; everybody sees the number. So when the two disagree on
 * a write, the link is the stale one: prod 2026-09-16, SAN-00954/26 was picked
 * onto 41865/26 while its sleeve, its quantity and its typed number were
 * 41871/26. The sys mirror filed it on 41865/26, the rejection and the
 * certificate followed the link there, and 41871/26 showed a second PSS with
 * nothing on file. PATCH has applied this rule since 2026-09-21; this is the
 * same rule for the rows intake creates, whatever the client sent.
 *
 * A link the number agrees with stays (a split member by its printed number, or
 * the family's bare number). A contradicted link is replaced by the contract
 * the number names, which may be none. No number, no link, or a contract row
 * that cannot be read: nothing is contradicted, the write keeps what it sent.
 */
export async function contractIdForWrite(
  db: SupabaseClient<any>,
  row: { contract_id?: string | null; wolthers_contract_nr?: string | null },
): Promise<string | null> {
  const contractId = row.contract_id || null
  const typed = (row.wolthers_contract_nr ?? '').trim()
  if (!contractId || !typed) return contractId
  const { data, error } = await db
    .from('contracts')
    .select('id, contract_number, split_suffix')
    .eq('id', contractId)
    .maybeSingle()
  if (error) throw error
  const linked = data as NumberedContract | null
  if (!linked || fkAgreesWithNumber(linked.contract_number, typed, linked.split_suffix ?? null)) return contractId
  const { contractId: named } = await resolveContractLinkForNumber(db, typed, contractId)
  console.warn(
    `[contract-link] number "${typed}" contradicts contract_id ${contractId} ("${contractDisplayNumber(linked)}"); linking ${named ?? 'nothing'}`,
  )
  return named
}
