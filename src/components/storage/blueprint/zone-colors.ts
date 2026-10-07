/** Chart palette from CLAUDE.md; past six companies the colours repeat with a hatch. */
export const ZONE_PALETTE = ['#556b2f', '#a9a454', '#b07946', '#445763', '#efe4d4', '#151618'] as const

export interface ZoneStyle { color: string; hatched: boolean }

/** One style per company, in the order given (the layout lists companies by name). */
export function zoneStyles(companyIds: string[]): Map<string, ZoneStyle> {
  return new Map(
    companyIds.map((id, i) => [id, { color: ZONE_PALETTE[i % ZONE_PALETTE.length], hatched: i >= ZONE_PALETTE.length }]),
  )
}
