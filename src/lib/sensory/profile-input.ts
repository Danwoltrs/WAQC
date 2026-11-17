import { sanitizePicks } from './picks'
import { PROFILE_NOTE_CAP } from './types'

export const PROFILE_COLUMNS = 'id, name, origin, region, notes, description, is_active'

export type ProfileInputResult =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string }

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Validates a regional-profile request body into table columns. With
 * `partial` (PATCH) only the keys present in the body are returned.
 */
export function parseProfileInput(body: unknown, partial: boolean): ProfileInputResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const has = (k: string) => k in b
  const fields: Record<string, unknown> = {}

  if (!partial || has('name')) {
    const name = text(b.name)
    if (!name) return { ok: false, error: 'Name is required' }
    fields.name = name
  }
  for (const k of ['origin', 'region', 'description'] as const) {
    if (!partial || has(k)) fields[k] = text(b[k])
  }
  if (!partial || has('notes')) fields.notes = sanitizePicks(b.notes, PROFILE_NOTE_CAP)
  if (partial && typeof b.is_active === 'boolean') fields.is_active = b.is_active
  return { ok: true, fields }
}

/** Maps a Postgres/PostgREST error code to an HTTP response shape, or null for "unexpected". */
export function profileDbError(code: string | undefined): { status: number; error: string } | null {
  if (code === '23505') return { status: 409, error: 'A profile with this name already exists.' }
  if (code === '42501') return { status: 403, error: 'Only lab staff can manage regional profiles' }
  return null
}
