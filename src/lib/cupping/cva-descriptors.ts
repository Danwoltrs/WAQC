/**
 * What the cupper actually highlighted on the SCA flavour wheel, shaped for
 * the certificate.
 *
 * The wheel stores two things per group: `picks`, each a full path from the
 * wheel's centre outwards (e.g. `["Nutty/Cocoa","Cocoa","Chocolate"]`), and
 * `cata` — the check-all-that-apply categories, which are DERIVED from those
 * picks (see CvaDescribe). Printing both would print "Nutty/Cocoa, Cocoa,
 * Chocolate" for what the cupper selected once, so only the LEAF of each path
 * is printed: the most specific term they chose, which is the one they meant.
 *
 * Mouthfeel is the exception — it has no wheel, only its five official CATA
 * options — so its `cata` is the selection itself and is printed verbatim.
 */
import type { CvaDescribe } from '@/types/cva'

export interface CvaDescriptorGroups {
  /** Leaf terms picked on the fragrance/aroma wheel. */
  aroma: string[]
  /** Leaf terms picked on the flavour/aftertaste wheel. */
  flavor: string[]
  /** The five official mouthfeel CATA options, verbatim. */
  mouthfeel: string[]
  /** Basic tastes (sweet/sour/salty/bitter/umami), at most two. */
  mainTastes: string[]
  /**
   * Every wheel path the cupper picked, full depth and unflattened, e.g.
   * `[["Nutty/Cocoa","Cocoa","Chocolate"], ["Sweet","Brown Sugar"]]`.
   *
   * The leaf arrays above are for printing; this is for DRAWING — the
   * certificate's wheel lights up each node along a picked path, so it needs
   * the ancestors the leaf name alone cannot supply. Both olfactory groups are
   * merged: the printed wheel shows what the cupper found in this coffee, not
   * which form box it was written in.
   */
  paths: string[][]
}

/** Full paths of each pick, in order, de-duplicated, malformed entries dropped. */
function fullPaths(picks: { path?: string[] }[] | null | undefined): string[][] {
  const out: string[][] = []
  const seen = new Set<string>()
  for (const pick of picks ?? []) {
    const path = pick?.path
    if (!Array.isArray(path) || path.length === 0) continue
    const cleaned = path
      .filter((seg): seg is string => typeof seg === 'string')
      .map((seg) => seg.trim())
      .filter((seg) => seg !== '')
    if (cleaned.length !== path.length || cleaned.length === 0) continue
    const key = cleaned.join('>')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

/** Leaf of each wheel path, in pick order, de-duplicated, blanks dropped. */
function leaves(picks: { path?: string[] }[] | null | undefined): string[] {
  const out: string[] = []
  for (const pick of picks ?? []) {
    const path = pick?.path
    if (!Array.isArray(path) || path.length === 0) continue
    const leaf = path[path.length - 1]
    if (typeof leaf !== 'string') continue
    const trimmed = leaf.trim()
    if (trimmed === '' || out.includes(trimmed)) continue
    out.push(trimmed)
  }
  return out
}

/** Non-empty trimmed strings, de-duplicated, order preserved. */
function terms(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed === '' || out.includes(trimmed)) continue
    out.push(trimmed)
  }
  return out
}

/**
 * Null when the cupper highlighted nothing at all — the certificate then
 * prints no descriptor block rather than an empty heading. A lot cupped
 * before the describe overlay existed has no `describe` key at all, which
 * reads the same way.
 */
export function cvaDescriptors(
  describe: Partial<CvaDescribe> | null | undefined,
): CvaDescriptorGroups | null {
  if (!describe) return null
  const groups: CvaDescriptorGroups = {
    aroma: leaves(describe.aroma?.picks),
    flavor: leaves(describe.flavor_aftertaste?.picks),
    mouthfeel: terms(describe.mouthfeel?.cata),
    mainTastes: terms(describe.flavor_aftertaste?.main_tastes),
    paths: [...fullPaths(describe.aroma?.picks), ...fullPaths(describe.flavor_aftertaste?.picks)],
  }
  const empty =
    groups.aroma.length === 0 &&
    groups.flavor.length === 0 &&
    groups.mouthfeel.length === 0 &&
    groups.mainTastes.length === 0
  return empty ? null : groups
}
