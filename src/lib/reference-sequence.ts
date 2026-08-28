/**
 * Suggest the next reference when a sample gains another contract.
 *
 * One seed: bump the FIRST run of digits, keeping its width
 * ("50235-1" → "50236-1", "56542/26" → "56543/26"). Two seeds of the same
 * shape: find the one run that moved and keep stepping it
 * ("S664243-13", "S664243-14" → "S664243-15") — this is how the tool adapts
 * after the user corrects the first guess. Anything else → no suggestion.
 */
const DIGITS = /\d+/g

interface Run { start: number; end: number; text: string }

function runs(s: string): Run[] {
  const out: Run[] = []
  for (const m of s.matchAll(DIGITS)) out.push({ start: m.index!, end: m.index! + m[0].length, text: m[0] })
  return out
}
const skeleton = (s: string) => s.replace(DIGITS, '#')

function bump(s: string, run: Run, step: number): string {
  const next = String(BigInt(run.text) + BigInt(step)).padStart(run.text.length, '0')
  return s.slice(0, run.start) + next + s.slice(run.end)
}

export function nextReference(previous: string | null | undefined, before?: string | null): string | null {
  const prev = (previous ?? '').trim()
  if (!prev) return null
  const prevRuns = runs(prev)
  if (prevRuns.length === 0) return null

  const bef = (before ?? '').trim()
  if (bef && skeleton(bef) === skeleton(prev)) {
    const befRuns = runs(bef)
    const changed = prevRuns
      .map((r, i) => ({ r, step: Number(BigInt(r.text) - BigInt(befRuns[i].text)) }))
      .filter((x) => x.step !== 0)
    if (changed.length > 1) return null
    if (changed.length === 1 && changed[0].step > 0) return bump(prev, changed[0].r, changed[0].step)
  }
  return bump(prev, prevRuns[0], 1)
}

/** The reference fields that get a suggestion when a contract is added. */
export const SUGGESTED_REF_FIELDS = [
  'exporter_sample_number', 'wolthers_contract_nr', 'supplier_contract_nr', 'buyer_contract_nr',
  'roaster_contract_nr', 'qc_client_contract_nr', 'end_client_contract_nr',
] as const
export type SuggestedRefField = (typeof SUGGESTED_REF_FIELDS)[number]
export type RefBag = Partial<Record<SuggestedRefField, string | null | undefined>>

export function suggestContractRefs(previous: RefBag, before?: RefBag | null): Partial<Record<SuggestedRefField, string>> {
  const out: Partial<Record<SuggestedRefField, string>> = {}
  for (const f of SUGGESTED_REF_FIELDS) {
    const next = nextReference(previous[f], before?.[f])
    if (next) out[f] = next
  }
  return out
}
