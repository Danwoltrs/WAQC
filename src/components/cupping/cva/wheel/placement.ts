// Where the describe overlay puts the descriptors (picks, main tastes, free notes).
//
// Until 2026-10-06 a desktop got a card floating over the bottom of the stage,
// and on a 1366×650 laptop it covered 34 of the 85 leaves at rest — Green/
// Vegetative and Other entirely, every point below the hub — and took the
// pointer there (Daniel: "when we mouse over the lower part of the wheel, we cant
// see the buttons"). A desktop now never overlaps the two: the descriptors go
// beside the wheel, or below it when that leaves the bigger wheel (a portrait
// screen). Compact screens keep the floating, collapsible tray tuned on the phone.

export type TrayPlacement = 'overlay' | 'side' | 'stacked'

/** The side panel's width plus its gap to the wheel (CSS px). */
export const SIDE_PANEL_W = 340
/** The stacked tray's typical height plus its padding (CSS px) — only used to choose. */
export const STACKED_TRAY_H = 240

export function trayPlacement(stageW: number, stageH: number, compact: boolean): TrayPlacement {
  if (compact) return 'overlay'
  if (!stageW || !stageH) return 'side'
  const beside = Math.min(stageW - SIDE_PANEL_W, stageH)
  const below = Math.min(stageW, stageH - STACKED_TRAY_H)
  return beside >= below ? 'side' : 'stacked'
}
