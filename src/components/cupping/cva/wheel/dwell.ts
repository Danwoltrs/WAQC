// Desktop hover intent, pure. Resting the mouse on a wedge flies the camera to
// that wedge's FAMILY; resting on the hub zooms out. The bands are the v8
// prototype's, kept because a sweep across the wheel must not fire into every
// family it brushes — a shorter band feels laggier, not snappier, because it
// triggers constantly. Restored 2026-09-03 at Daniel's request ("it doesn't
// auto zoom in with the mouse when we mouse over"); FlavorWheel keeps ONE
// setTimeout for it.
//
// RESTING means resting (Daniel 2026-10-06: "Mouse circling around makes it very
// laggy"). Until then the clock kept counting while the mouse wandered anywhere
// inside one family, so a hand passing through a big family flew the camera, and
// each fly moved the wheel under the still-moving hand into the next family —
// seven flies in eleven seconds of plain circling. Now the clock restarts once the
// pointer travels DWELL_SLOP_PX from where it started, and after any fly nothing
// arms until the pointer has moved DWELL_REARM_PX from where that fly began.
import type { Region } from './hit-test'

export const DWELL_IN = 210       // rest → a family
export const DWELL_SWITCH = 240   // one family → another (the mouse crosses the neighbours on its way to the tray)
export const DWELL_OUT = 220      // hub → whole wheel
/** How far a resting hand may drift (CSS px) before the clock starts over. */
export const DWELL_SLOP_PX = 10
/** How far the pointer must travel after a fly before hover may arm another. */
export const DWELL_REARM_PX = 24

/** A running dwell clock: what it will do, and where the pointer was when it started. */
export interface DwellClock { key: string; x: number; y: number }

/** Keep the running clock? Only for the same intent with the pointer still within the slop of where it started. */
export function dwellKeepsCounting(clock: DwellClock | null, key: string, x: number, y: number): boolean {
  return !!clock && clock.key === key && Math.hypot(x - clock.x, y - clock.y) <= DWELL_SLOP_PX
}

/** May hover arm again? `since` is where the pointer was when the last fly began (null once it has moved on). */
export function dwellRearmed(since: { x: number; y: number } | null, x: number, y: number): boolean {
  return !since || Math.hypot(x - since.x, y - since.y) >= DWELL_REARM_PX
}

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
