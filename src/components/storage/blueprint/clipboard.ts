/**
 * The storage editor's clipboard: kept in memory and mirrored to
 * localStorage, so shapes copied in one lab paste in another (or another tab).
 * Storage can be blocked or cleared; every access is wrapped and the memory
 * copy carries on.
 */
import { parseFloorPlan, parseShelfInputs } from '@/lib/storage/floor-plan'
import type { Clip, ClipShelf } from './editor-state'

export const CLIPBOARD_KEY = 'waqc.storage.clipboard'

let memory: Clip | null = null

export function writeClipboard(clip: Clip): void {
  memory = clip
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clip))
  } catch {
    // Private mode or blocked storage: the memory copy is enough for this tab.
  }
}

/** The stored clip when there is one (it may come from another tab), else this tab's. */
export function readClipboard(): Clip | null {
  try {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY)
    if (raw) return asClip(JSON.parse(raw))
  } catch {
    // Unreadable storage or JSON: fall back to memory.
  }
  return memory
}

/** A stored value checked the way a saved plan is, or null. */
export function asClip(v: unknown): Clip | null {
  if (typeof v !== 'object' || v === null) return null
  const c = v as Record<string, unknown>
  if (c.version !== 1) return null
  const plan = parseFloorPlan({ version: 1, rooms: c.rooms, items: c.items, groups: c.groups })
  if (!plan.ok) return null
  const shelves = parseShelfInputs(c.shelves, new Set(plan.value.groups.map((g) => g.id)))
  if (!shelves.ok) return null
  return {
    version: 1,
    rooms: plan.value.rooms,
    items: plan.value.items,
    groups: plan.value.groups,
    shelves: shelves.value.map((s): ClipShelf => ({
      shelf_letter: s.shelf_letter, rows: s.rows, columns: s.columns, samples_per_position: s.samples_per_position,
      x_cm: s.x_cm, y_cm: s.y_cm, width_cm: s.width_cm, depth_cm: s.depth_cm, rot: s.rot, access_side: s.access_side,
      group_id: s.group_id,
    })),
  }
}
