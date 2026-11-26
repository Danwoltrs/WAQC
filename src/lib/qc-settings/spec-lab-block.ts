/**
 * A quality specification belongs to one laboratory. Its own laboratory (the
 * user's settings laboratory) may change it, and so may a global admin; any
 * other user may look at it but not write to it.
 */
import { loadLabScope } from '@/lib/auth/lab-scope'
import { loadSettingsLab } from '@/lib/qc-settings/user-lab'

export const OTHER_LAB_SPEC_ERROR =
  'This quality specification belongs to another laboratory: it can be viewed from here, not changed'

/** Null when the user may change the spec's laboratory's rows; otherwise the 403 message. */
export async function otherLabBlock(db: any, userId: string, specLabId: string | null): Promise<string | null> {
  const [scope, settingsLab] = await Promise.all([loadLabScope(db, userId), loadSettingsLab(db, userId)])
  return scope.isGlobal || specLabId === settingsLab ? null : OTHER_LAB_SPEC_ERROR
}

export const SPEC_LAB_MOVE_ERROR = "A quality specification's laboratory cannot be changed."

/**
 * Null unless a PATCH body names a laboratory other than the spec's; then the
 * 400 message. A spec never moves: its template copy belongs to its laboratory
 * (migration 20261126000000), and no PATCH writes laboratory_id. Naming the
 * spec's own laboratory, or none, is fine.
 */
export function specLabMoveBlock(body: { laboratory_id?: unknown } | null | undefined, specLabId: string | null): string | null {
  if (!body || body.laboratory_id === undefined) return null
  return body.laboratory_id === specLabId ? null : SPEC_LAB_MOVE_ERROR
}
