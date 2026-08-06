/**
 * Turning stored quality shapes into numbers.
 *
 * Both the approval gate (src/lib/compliance.ts) and the public certificate
 * page read these fields. They used to read them differently — the page showed
 * screen grams as percentages and preferred a stored defect total the gate
 * ignored — which meant a public page could describe a lot the gate had judged
 * on other numbers. One module, one reading.
 */

export interface CuppingDefects {
  taints?: Array<{ name?: string; intensity?: number }>
  faults?: Array<{ name?: string; intensity?: number }>
}

export interface CuppingScoreRow {
  cupper_id: string | null
  scores: Record<string, unknown> | null
  defects: CuppingDefects | null
}

export interface DefectCounts {
  primary: number
  secondary: number
  total: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * green_bean_data.screen_sizes holds GRAMS off the sieve stack, not percentages
 * — see the grading form, which keeps a separate screen_sizes_percentages for
 * display and never persists it. Percentages are always derived here.
 *
 * Returns null when nothing was sieved, so callers can hide the section rather
 * than divide by zero.
 */
export function screenGramsToPercent(
  raw: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (!raw || typeof raw !== 'object') return null
  const totalGrams = Object.values(raw).reduce<number>((sum, g) => sum + num(g), 0)
  if (totalGrams <= 0) return null

  const percentages: Record<string, number> = {}
  for (const [size, grams] of Object.entries(raw)) {
    percentages[size] = (num(grams) / totalGrams) * 100
  }
  return percentages
}

/**
 * Primary and secondary counts, and the total.
 *
 * The total is ALWAYS the sum. A quality allowing 1 primary, 21 secondary and
 * 21 total rejects a lot with 1 primary and 21 secondary: each individual limit
 * is met, but the total is 22. A stored defects.total is never trusted.
 *
 * Only the plain { primary, secondary } keys are read — that is what the
 * approval gate has always read. certificate-data.ts writes a differently
 * shaped { total_primary, total_secondary } record for its own purposes, but
 * honouring that shape here would silently re-judge lots the gate approved
 * as zero-defect against a count it never saw.
 */
export function resolveDefectCounts(defects: unknown): DefectCounts | null {
  if (!defects || typeof defects !== 'object') return null
  const d = defects as Record<string, unknown>
  const primary = num(d.primary)
  const secondary = num(d.secondary)
  return { primary, secondary, total: primary + secondary }
}

/**
 * How many taints and faults this lot carries.
 *
 * A designated master cupper's record is authoritative. Without one, take the
 * maximum across cuppers rather than the sum — two cuppers flagging the same
 * taint is one taint, not two.
 */
export function resolveTaintFaultCounts(
  scores: CuppingScoreRow[],
  masterCupperId: string | null,
): { taints: number; faults: number } {
  const count = (arr: unknown): number => (Array.isArray(arr) ? arr.length : 0)

  if (masterCupperId) {
    const master = scores.find(s => s.cupper_id === masterCupperId)
    if (master?.defects && typeof master.defects === 'object') {
      return { taints: count(master.defects.taints), faults: count(master.defects.faults) }
    }
    return { taints: 0, faults: 0 }
  }

  let taints = 0
  let faults = 0
  for (const score of scores) {
    if (!score.defects || typeof score.defects !== 'object') continue
    taints = Math.max(taints, count(score.defects.taints))
    faults = Math.max(faults, count(score.defects.faults))
  }
  return { taints, faults }
}

/**
 * The cup profile ("Strictly Soft", "Hard", "Rioy") is a category, not a score.
 *
 * It travels in the same `cupping_scores.scores` map as the sensory attributes,
 * so anything that plots or grades that map has to exclude it by name — a
 * category has no scale to sit on and no band to be inside or outside of.
 * Matches the key cuppers actually write (`Flavor_descriptor`) and the spellings
 * around it.
 */
export function isFlavorDescriptor(name: string): boolean {
  return /flavou?r[\s_-]*descriptor/i.test(name)
}

/**
 * The score each attribute is judged on: the master cupper's where they scored
 * it, the mean across cuppers everywhere else.
 */
export function resolveFinalScores(
  scores: CuppingScoreRow[],
  masterCupperId: string | null,
): Record<string, number> {
  const final: Record<string, number> = {}

  if (masterCupperId) {
    const master = scores.find(s => s.cupper_id === masterCupperId)
    if (master?.scores && typeof master.scores === 'object') {
      for (const [attr, value] of Object.entries(master.scores)) {
        if (typeof value === 'number') final[attr] = value
      }
    }
  }

  for (const score of scores) {
    if (!score.scores || typeof score.scores !== 'object') continue
    for (const [attr, value] of Object.entries(score.scores)) {
      if (typeof value !== 'number' || final[attr] !== undefined) continue
      let sum = 0
      let count = 0
      for (const other of scores) {
        const v = other.scores?.[attr]
        if (typeof v === 'number') {
          sum += v
          count++
        }
      }
      final[attr] = count > 0 ? sum / count : value
    }
  }

  return final
}
