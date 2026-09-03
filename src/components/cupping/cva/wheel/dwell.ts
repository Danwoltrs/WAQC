// Desktop hover intent, pure. Resting the mouse on a wedge flies the camera to
// that wedge's FAMILY; resting on the hub zooms out. The bands are the v8
// prototype's, kept because a sweep across the wheel must not fire into every
// family it brushes — a shorter band feels laggier, not snappier, because it
// triggers constantly. Restored 2026-09-03 at Daniel's request ("it doesn't
// auto zoom in with the mouse when we mouse over"); FlavorWheel keeps ONE
// setTimeout for it, re-armed only when the plan's key changes, never per move.
import type { Region } from './hit-test'

export const DWELL_IN = 210       // rest → a family
export const DWELL_SWITCH = 240   // one family → another (the mouse crosses muted neighbours on its way to the tray)
export const DWELL_OUT = 220      // hub → whole wheel

export interface DwellPlan { key: string; ms: number; family: string | null }

/** What the mouse resting HERE should do — or null when resting here means nothing (any pending timer is cleared). */
export function planDwell(focus: string | null, region: Region): DwellPlan | null {
  if (region.kind === 'node') {
    const fam = region.node.family
    if (fam === focus) return null   // inside the focused family clicks toggle picks; hover must stay inert
    return { key: `fam:${fam}`, ms: focus ? DWELL_SWITCH : DWELL_IN, family: fam }
  }
  if (region.kind === 'hub' && focus) return { key: 'out', ms: DWELL_OUT, family: null }
  return null
}
