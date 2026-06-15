// Pure state logic for the v8 graded hover zoom. The FlavorWheel component
// samples the pointer, calls planDwell, and (re)schedules one timer.
// Constants are NORMATIVE — they mirror the locked prototype's JS.

export type ZoomMode = 'rest' | 'mid' | 'full'
export interface ZoomState { mode: ZoomMode; fam: string | null }
export interface HoverSample { region: 'hub' | 'node' | 'none'; fam?: string; ring?: number }

// Rest shows the whole wheel (outer segments readable, not bleeding off); focused
// zoom is gentle so neighbouring families stay on-screen for a continuous flow.
export const REST_S = 1.06
export const DEPTHS = { full: { s: 1.6, r: 92 }, mid: { s: 1.32, r: 56 } } as const

// Small screens / iPad only (Daniel 2026-06-12: desktop keeps the values above).
// Rest fills the stage with the two inner rings — the leaf ring bleeds past the
// stage edge; focused zoom goes deeper so leaf labels are readable on a tablet.
export const COMPACT_MQ = '(max-width: 1023px), (pointer: coarse)'
export const REST_S_COMPACT = 1.38
export const DEPTHS_COMPACT = { full: { s: 1.9, r: 130 }, mid: { s: 1.5, r: 70 } } as const
export const DWELL = { in: 190, backIn: 180, mid: 200, out: 220, switch: 240 } as const

export type DwellPlan =
  | { kind: 'schedule'; key: string; ms: number; next: ZoomState }
  | { kind: 'clear' }

// Descriptor-tray auto-hide (Daniel 2026-06-12: "hide the descriptors when the
// mouse is trying to look at the bottom parts"). The tray floats over the
// wheel's lower portion; hovering there fades it away. Two thresholds form a
// dead zone (viewBox y, centre = 220) so a cursor sweeping past the boundary
// doesn't flick the tray on and off — the original single-threshold check did.
export const SHADE_HIDE_Y = 244   // shown → hide once the pointer drops below here
export const SHADE_SHOW_Y = 196   // hidden → keep hidden until it rises above here

/** Next tray-shade state from the previous one and the current pointer sample.
    Off-wheel / hub (no node) always reveals; otherwise the dead zone holds the
    previous state, so only a deliberate cross flips it. */
export function nextShade(prev: boolean, overNode: boolean, y: number): boolean {
  if (!overNode) return false
  return prev ? y >= SHADE_SHOW_Y : y > SHADE_HIDE_Y
}

export function planDwell(state: ZoomState, hover: HoverSample): DwellPlan {
  if (state.mode === 'rest') {
    if (hover.region === 'node' && hover.fam)
      return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.in, next: { mode: 'full', fam: hover.fam } }
    return { kind: 'clear' }
  }
  if (hover.region === 'hub')
    return {
      kind: 'schedule', key: 'out',
      ms: state.mode === 'mid' ? DWELL.backIn : DWELL.out,
      next: { mode: 'rest', fam: null },
    }
  if (hover.region !== 'node' || !hover.fam) return { kind: 'clear' }
  if (state.mode === 'full') {
    if (hover.fam === state.fam) {
      if (hover.ring === 1)
        return { kind: 'schedule', key: 'mid', ms: DWELL.mid, next: { mode: 'mid', fam: state.fam } }
      return { kind: 'clear' }
    }
    return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.switch, next: { mode: 'full', fam: hover.fam } }
  }
  // mid
  if (hover.fam === state.fam && hover.ring === 1) return { kind: 'clear' }
  return { kind: 'schedule', key: `full:${hover.fam}`, ms: DWELL.backIn, next: { mode: 'full', fam: hover.fam } }
}
