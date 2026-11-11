/** Approval band colours: olive from 90%, yellow-green 70-89%, red below 70%. Null stays uncoloured. */
export function approvalBandColor(pct: number | null): string | undefined {
  if (pct == null) return undefined
  return pct >= 90 ? '#556b2f' : pct >= 70 ? '#a9a454' : '#ef4444'
}

export const pctText = (pct: number | null): string => (pct == null ? '-' : `${pct}%`)
