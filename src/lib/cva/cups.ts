// The cups & uniformity rules of SCA-104 §5.4, as pure functions over the five
// cups. The component holds MARKS (what the cupper tapped) and one defect type;
// storage holds CvaCups (what the standard records). The two differ on purpose —
// see cupsFromMarks — and every CVA score in the database had u = d = 0 until
// something wrote the latter (types/cva.ts defined cups; nothing set them).
import type { CvaCups, CvaDefectType } from '@/types/cva'

export const CUP_COUNT = 5

/** What the cupper tapped on a cup: clean, qualitatively different, or carrying a sensory defect. */
export type CupMark = 'none' | 'nu' | 'def'

export const DEFECT_TYPES: readonly CvaDefectType[] = ['moldy', 'phenolic', 'potato']

/** One tap advances a cup: clean → non-uniform → defective → clean. */
export const cycleMark = (m: CupMark): CupMark => (m === 'none' ? 'nu' : m === 'nu' ? 'def' : 'none')

/**
 * What gets WRITTEN, from what was tapped. Two rules of the standard live here:
 *
 * §5.4.1 — a defect needs BOTH fields, the cups and the type: "If any of these
 * two fields are not properly filled out, the coffee shall not be counted as
 * defective." So an untyped defect is not written as defective at all. The cup
 * was still marked as different from the rest, so it stays non-uniform — it
 * costs its −2 and never scores as clean while the entry is unfinished.
 *
 * §5.4.2 — "all defective cups shall be also marked as non-uniform, with the
 * sole exception of evenly defective coffees across all cups." A counted defect
 * therefore appears in BOTH lists; five counted defects appear only in the
 * defective list. The exception is about defective cups, so it applies only
 * when the defects are counted (typed) — five untyped ones are five cups the
 * cupper flagged as different, and are written as such.
 */
export function cupsFromMarks(marks: readonly CupMark[], type: CvaDefectType | null): CvaCups {
  const defs = idx(marks, (m) => m === 'def')
  const counted = type ? defs : []
  const evenlyDefective = counted.length === CUP_COUNT
  return {
    non_uniform: evenlyDefective ? [] : idx(marks, (m) => m !== 'none').map((i) => i + 1),
    defective: counted.map((i) => ({ cup: i + 1, type: type! })),
  }
}

/**
 * Reading a saved assessment back into marks. A cup in the defective list is
 * 'def' whatever its non-uniform flag says (§5.4.2 puts it in both). The type
 * is the first defect's — the form carries ONE defect type per sample, so a
 * mixed row can only come from a hand edit. A row saved before cups existed
 * reads as an untouched table.
 */
export function marksFromCups(cups: CvaCups | null | undefined): { marks: CupMark[]; type: CvaDefectType | null } {
  const marks = Array<CupMark>(CUP_COUNT).fill('none')
  for (const n of cups?.non_uniform ?? []) if (n >= 1 && n <= CUP_COUNT) marks[n - 1] = 'nu'
  for (const d of cups?.defective ?? []) if (d.cup >= 1 && d.cup <= CUP_COUNT) marks[d.cup - 1] = 'def'
  return { marks, type: cups?.defective?.[0]?.type ?? null }
}

/** The live line under the cups: −2 per non-uniform, −4 per COUNTED defect, and how many defects are waiting on a type. */
export function cupPenalty(marks: readonly CupMark[], type: CvaDefectType | null): { u: number; d: number; uncounted: number; penalty: number } {
  const cups = cupsFromMarks(marks, type)
  const u = cups.non_uniform.length
  const d = cups.defective.length
  const uncounted = idx(marks, (m) => m === 'def').length - d
  return { u, d, uncounted, penalty: 2 * u + 4 * d }
}

const idx = (marks: readonly CupMark[], pred: (m: CupMark) => boolean): number[] =>
  marks.flatMap((m, i) => (pred(m) ? [i] : []))
