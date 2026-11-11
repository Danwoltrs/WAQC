/**
 * `samples.contract_date`: the contract date the lab types for a lot whose
 * contract is not on the system. Version picking reads it before the linked
 * contract's date. A calendar date, YYYY-MM-DD; empty clears it.
 */

export const CONTRACT_DATE_ERROR = 'Contract date must be YYYY-MM-DD'

export type ParsedContractDate = { ok: true; value: string | null } | { ok: false }

export function parseContractDate(value: unknown): ParsedContractDate {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  const text = value.trim()
  if (text === '') return { ok: true, value: null }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return { ok: false }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
  return real ? { ok: true, value: text } : { ok: false }
}

/**
 * Validate the `contract_date` of each contract row of an intake or
 * add-contracts body. A row that names no date is left as it is; a named one
 * is normalised (empty = null). `contracts` is undefined when the body carries
 * no array.
 */
export function contractDatesOf(
  contracts: unknown,
): { ok: true; contracts?: Record<string, unknown>[] } | { ok: false } {
  if (!Array.isArray(contracts)) return { ok: true }
  const out: Record<string, unknown>[] = []
  for (const row of contracts) {
    if (!row || typeof row !== 'object' || !('contract_date' in row)) {
      out.push(row)
      continue
    }
    const parsed = parseContractDate((row as Record<string, unknown>).contract_date)
    if (!parsed.ok) return { ok: false }
    out.push({ ...(row as Record<string, unknown>), contract_date: parsed.value })
  }
  return { ok: true, contracts: out }
}
