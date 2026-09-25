/**
 * Quality findings for the year, read once per graded lot (the lab unit —
 * contract siblings share its grading and cupping): which primary and
 * secondary defects appeared, which taints and faults, and how heavy the
 * defect load ran.
 *
 * Buyer-facing: a lot approved with comments is read through `buyerSafeGreen`
 * (its issued values), exactly as the buyer's certificate prints it.
 */
import { extractGreenDefects } from '@/lib/report-data'
import { resolveDefectCounts, type CupDefect } from '@/lib/quality-resolvers'
import { buildIssuedGreenBean, type IssuedValues } from '@/lib/tolerance/issued-values'
import type { GreenBeanData } from '@/lib/compliance-criteria'
import { isPrimaryDefect } from '@/lib/defect-classification'
import { round1 } from './annual-math'

export interface LabUnitQuality {
  labUnitId: string
  shipper: string | null
  /** The lab unit's earliest certificate for this client in the year. */
  certificateNumber: string
  /** Buyer-safe green_bean_data; null when ungraded or withheld. */
  green: unknown
  /** The taints and faults its certificate prints (resolveCupDefects). */
  cupDefects: CupDefect[]
}

export interface WorstLot { count: number; shipper: string | null; certificate: string }
export interface DefectStat { name: string; lots: number; total: number; worst: WorstLot }
export interface CupDefectStat { name: string; lots: number }

export interface DefectLoadStat {
  graded: number
  avgPrimary: number
  avgSecondary: number
  avgTotal: number
  /** null when every graded lot was clean. */
  worst: { total: number; shipper: string | null; certificate: string } | null
}

export interface QualityFindings {
  lots: number
  gradedLots: number
  primary: DefectStat[]
  secondary: DefectStat[]
  taints: CupDefectStat[]
  faults: CupDefectStat[]
  load: DefectLoadStat | null
}

export function emptyQualityFindings(): QualityFindings {
  return { lots: 0, gradedLots: 0, primary: [], secondary: [], taints: [], faults: [], load: null }
}

/**
 * The green grading a BUYER may see. buildIssuedGreenBean swaps in the issued
 * counts and totals; a `defect_list` written by an editor would still carry the
 * real counts beside them, so it is dropped whenever issued counts exist.
 */
export function buyerSafeGreen(green: unknown, issued: IssuedValues): unknown {
  const out = buildIssuedGreenBean((green ?? null) as GreenBeanData | null, issued)
  if (!issued.defects || !out.defects || typeof out.defects !== 'object') return out
  const defects = { ...(out.defects as Record<string, unknown>) }
  delete defects.defect_list
  return { ...out, defects }
}

function sortStats(map: Map<string, DefectStat>): DefectStat[] {
  return [...map.values()].sort((a, b) => b.lots - a.lots || b.total - a.total || a.name.localeCompare(b.name, 'en'))
}

function sortCup(map: Map<string, number>): CupDefectStat[] {
  return [...map.entries()]
    .map(([name, lots]) => ({ name, lots }))
    .sort((a, b) => b.lots - a.lots || a.name.localeCompare(b.name, 'en'))
}

export function buildQualityFindings(lots: LabUnitQuality[]): QualityFindings {
  const primary = new Map<string, DefectStat>()
  const secondary = new Map<string, DefectStat>()
  const taints = new Map<string, number>()
  const faults = new Map<string, number>()
  const loads: Array<{ primary: number; secondary: number; total: number; lot: LabUnitQuality }> = []

  for (const lot of lots) {
    const defects =
      lot.green && typeof lot.green === 'object' ? (lot.green as { defects?: unknown }).defects : undefined
    // Graded = the lot carries a defect grading at all. A clean lot counts
    // (zeros belong in an average per graded lot); a lot never graded does not.
    if (defects && typeof defects === 'object') {
      const c = resolveDefectCounts(defects)
      if (c) loads.push({ primary: c.primary, secondary: c.secondary, total: c.total, lot })
    }

    for (const d of lot.green ? extractGreenDefects(lot.green) : []) {
      const map = isPrimaryDefect(d.name) ? primary : secondary
      const cur = map.get(d.name) ?? { name: d.name, lots: 0, total: 0, worst: { count: 0, shipper: null, certificate: '' } }
      cur.lots += 1
      cur.total += d.count
      if (d.count > cur.worst.count) {
        cur.worst = { count: d.count, shipper: lot.shipper, certificate: lot.certificateNumber }
      }
      map.set(d.name, cur)
    }

    const lotTaints = new Set<string>()
    const lotFaults = new Set<string>()
    for (const cd of lot.cupDefects) (cd.kind === 'Taint' ? lotTaints : lotFaults).add(cd.name)
    for (const n of lotTaints) taints.set(n, (taints.get(n) ?? 0) + 1)
    for (const n of lotFaults) faults.set(n, (faults.get(n) ?? 0) + 1)
  }

  const avg = (key: 'primary' | 'secondary' | 'total') =>
    round1(loads.reduce((s, l) => s + l[key], 0) / loads.length)
  const heaviest = [...loads].sort(
    (a, b) => b.total - a.total || a.lot.certificateNumber.localeCompare(b.lot.certificateNumber, 'en'),
  )[0]

  return {
    lots: lots.length,
    gradedLots: loads.length,
    primary: sortStats(primary),
    secondary: sortStats(secondary),
    taints: sortCup(taints),
    faults: sortCup(faults),
    load:
      loads.length === 0
        ? null
        : {
            graded: loads.length,
            avgPrimary: avg('primary'),
            avgSecondary: avg('secondary'),
            avgTotal: avg('total'),
            worst:
              heaviest && heaviest.total > 0
                ? { total: round1(heaviest.total), shipper: heaviest.lot.shipper, certificate: heaviest.lot.certificateNumber }
                : null,
          },
  }
}
