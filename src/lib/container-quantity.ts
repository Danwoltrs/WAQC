/**
 * Container-based quantity: boxes × bags per box, the way sys.wolthers.com
 * quotes a contract (lib/inquiries/conversion.ts there). One box is one
 * shipping container. Bags per box defaults from the packaging and the
 * container size; MT per box follows from it, and either can be overridden.
 *
 * Bags (jute, PP) count physical bags of their own weight. Big bags and bulk
 * count 60 kg bag EQUIVALENTS (no per-bag weight), which may be fractional:
 * 19.338 MT in a box is 322.3 equivalents.
 */

export type ContainerSize = "20'" | "40'"
export const CONTAINER_SIZES: ContainerSize[] = ["20'", "40'"]
export const DEFAULT_CONTAINER_SIZE: ContainerSize = "20'"

export type PackingKind = 'jute_bag' | 'pp_bag' | 'big_bag' | 'bulk'

/** A 20' holds ~19,200 kg net of bagged coffee: 320 × 60 kg, 325 × 59 kg, 640 × 30 kg. */
export const NET_KG_20FT = 19200
/** A 40' holds ~1.375× a 20' (440 vs 320 × 60 kg bags). */
export const FORTY_FT_RATIO = 440 / 320
/** 60 kg equivalents in a 20' of bulk (21.6 MT) and of big bags (19.98 MT). */
const BULK_EQUIVALENTS_20FT = 360
const BIG_BAG_EQUIVALENTS_20FT = 333

/** Whether the packaging is counted in 60 kg equivalents rather than physical bags. */
export const countsEquivalents = (kind: PackingKind | '' | null | undefined) =>
  kind === 'bulk' || kind === 'big_bag'

export function normalizeContainerSize(size: string | null | undefined): ContainerSize {
  return /^\s*40/.test(size ?? '') ? "40'" : "20'"
}

/** The kg one counted unit weighs: the bag weight, or 60 for an equivalent. */
export function unitKg(kind: PackingKind, bagWeightKg: number | null): number | null {
  if (countsEquivalents(kind)) return 60
  return bagWeightKg && bagWeightKg > 0 ? bagWeightKg : null
}

/** Bags (or 60 kg equivalents) one box holds by default. */
export function defaultBagsPerBox(kind: PackingKind, bagWeightKg: number | null, size: ContainerSize): number {
  let base: number
  if (kind === 'bulk') base = BULK_EQUIVALENTS_20FT
  else if (kind === 'big_bag') base = BIG_BAG_EQUIVALENTS_20FT
  else base = bagWeightKg && bagWeightKg > 0 ? Math.round(NET_KG_20FT / bagWeightKg) : 320
  return size === "40'" ? Math.round(base * FORTY_FT_RATIO) : base
}

/** Physical big bags (supersacks, ~1 MT each) in a box: 20 in a 20', 40 in a 40'. */
export function bigBagsPerBox(size: ContainerSize): number {
  return size === "40'" ? 40 : 20
}

/** The most one box can hold: a full box of bulk (21.6 MT in a 20', 29.7 MT in a 40'). */
export function maxMtPerBox(size: ContainerSize): number {
  return round3((defaultBagsPerBox('bulk', null, size) * 60) / 1000)
}

export const round2 = (n: number) => Math.round(n * 100) / 100
export const round3 = (n: number) => Math.round(n * 1000) / 1000

export function mtPerBoxFromBags(bagsPerBox: number, kg: number): number {
  return round3((bagsPerBox * kg) / 1000)
}

/**
 * Bags per box for a typed MT per box. Equivalents keep their decimals (to
 * 2 dp); physical bags round UP to a whole bag, as on sys.
 */
export function bagsPerBoxFromMt(mt: number, kind: PackingKind, kg: number): number {
  const exact = Number(((mt * 1000) / kg).toFixed(6))
  return countsEquivalents(kind) ? round2(exact) : Math.ceil(exact)
}

/**
 * Boxes and bags per box for a stored total (a contract's volume, a PSS's
 * count): whole default boxes when the total divides into them, else one box
 * holding the whole total.
 */
export function boxesFromTotal(
  total: number,
  bagsPerBox: number,
): { boxes: number; bagsPerBox: number } {
  if (!(total > 0)) return { boxes: 1, bagsPerBox }
  if (bagsPerBox > 0) {
    const n = Number((total / bagsPerBox).toFixed(6))
    if (Number.isInteger(n) && n >= 1) return { boxes: n, bagsPerBox }
  }
  return { boxes: 1, bagsPerBox: total }
}

/**
 * A sys packaging string ("60kg", "59kg Generic GrainPro", "60kg Jute",
 * "Bulk", "Big Bags", "Big Bags + Pallets") read as kind, liner and weight.
 * Anything after the weight other than Jute or PP is a liner.
 */
export function parsePackaging(
  packaging: string | null | undefined,
): { kind: PackingKind; liner: string | null; weightKg: number | null } | null {
  const raw = (packaging ?? '').trim()
  if (!raw) return null
  const addOn = raw.match(/\s+(\+\s*.+)$/)
  const base = addOn ? raw.slice(0, addOn.index).trim() : raw
  const extra = addOn ? addOn[1].replace(/^\+\s*/, '+ ') : null
  if (/^bulk/i.test(base)) return { kind: 'bulk', liner: extra, weightKg: null }
  if (/^big\s*bags?/i.test(base)) return { kind: 'big_bag', liner: extra, weightKg: null }
  const m = base.match(/^(\d+(?:[.,]\d+)?)\s*kg\b\s*(.*)$/i)
  if (!m) return null
  const weightKg = parseFloat(m[1].replace(',', '.'))
  const rest = m[2].trim()
  if (/^(pp|polypropylene)\b/i.test(rest)) return { kind: 'pp_bag', liner: extra, weightKg }
  if (!rest || /^jute\b/i.test(rest)) return { kind: 'jute_bag', liner: extra, weightKg }
  return { kind: 'jute_bag', liner: rest, weightKg }
}
