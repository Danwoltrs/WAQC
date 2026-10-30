/**
 * The taint/fault list finalize stores on quality_assessments.resolved_defects
 * after the gate, and the counts that set the automatic clean/uniform cup.
 *
 * The validator's own list wins when the screen sent one. Without it, the
 * authoritative cupper's card (master cupper or validator) is taken; with no
 * such cupper the counts are the longest card's but no list is settled.
 */

type DefectLists = { taints?: unknown; faults?: unknown }
type CardRow = { cupper_id: string | null; defects: unknown }

export function settledDefects(
  submitted: { taints: unknown[]; faults: unknown[] } | null,
  cards: CardRow[] | null,
  authoritativeCupperId: string | null,
): { list: { taints: unknown[]; faults: unknown[] }; taints: number; faults: number } {
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

  // Stored whole: its resolved_by/resolved_at stamp is how every reader but
  // the PDF tells a settled list from a bare legacy one (hasResolvedDefects).
  // Rebuilding it from the two arrays dropped the stamp on every finalize from
  // 2026-09-10 to 2026-10-30.
  if (submitted) {
    const list = { ...submitted, taints: arr(submitted.taints), faults: arr(submitted.faults) }
    return { list, taints: list.taints.length, faults: list.faults.length }
  }

  const empty = { taints: [] as unknown[], faults: [] as unknown[] }
  if (!cards) return { list: empty, taints: 0, faults: 0 }

  if (authoritativeCupperId) {
    const card = cards.find((s) => s.cupper_id === authoritativeCupperId)
    if (card?.defects && typeof card.defects === 'object') {
      const d = card.defects as DefectLists
      const list = { taints: arr(d.taints), faults: arr(d.faults) }
      return { list, taints: list.taints.length, faults: list.faults.length }
    }
    return { list: empty, taints: 0, faults: 0 }
  }

  let taints = 0
  let faults = 0
  for (const card of cards) {
    if (!card.defects || typeof card.defects !== 'object') continue
    const d = card.defects as DefectLists
    if (Array.isArray(d.taints)) taints = Math.max(taints, d.taints.length)
    if (Array.isArray(d.faults)) faults = Math.max(faults, d.faults.length)
  }
  return { list: empty, taints, faults }
}
