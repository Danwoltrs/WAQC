/**
 * Per-laboratory QC settings: which row of a settings table a laboratory uses.
 * Settings tables carry one row per (owner, laboratory_id). A lab reads its own
 * row only, never another lab's.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { HQ_LAB_TYPE, type LabScope } from '@/lib/auth/lab-scope'

/**
 * The row whose laboratory_id is `labId`. Accepts an array or the legacy
 * single-object embed shape. Never falls back to another laboratory's row.
 */
export function pickLabRow<T extends { laboratory_id: string | null }>(
  rows: T[] | T | null | undefined,
  labId: string | null,
): T | null {
  if (!rows || labId === null) return null
  const list = Array.isArray(rows) ? rows : [rows]
  return list.find((r) => r.laboratory_id === labId) ?? null
}

/** The laboratory whose settings this user edits: their own, else HQ. */
export function settingsLabFor(scope: LabScope, hqLabId: string): string {
  return scope.ownLabId ?? hqLabId
}

// Cached per client object: each request builds its own client, so nothing
// outlives a request. Failures are not cached.
const hqCache = new WeakMap<SupabaseClient, Promise<string>>()

export function loadHqLabId(db: SupabaseClient): Promise<string> {
  const cached = hqCache.get(db)
  if (cached) return cached
  const p = (async () => {
    const { data, error } = await (db as any).from('laboratories').select('id').eq('type', HQ_LAB_TYPE)
    if (error) throw new Error(`Could not load the HQ laboratory: ${error.message ?? String(error)}`)
    const rows = (data ?? []) as { id: string }[]
    if (rows.length !== 1) throw new Error(`Expected exactly one HQ laboratory, found ${rows.length}`)
    return rows[0].id
  })()
  hqCache.set(db, p)
  p.catch(() => hqCache.delete(db))
  return p
}
