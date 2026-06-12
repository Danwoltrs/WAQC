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
export const DWELL = { in: 190, backIn: 180, mid: 200, out: 220, switch: 240 } as const

export type DwellPlan =
  | { kind: 'schedule'; key: string; ms: number; next: ZoomState }
  | { kind: 'clear' }

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
