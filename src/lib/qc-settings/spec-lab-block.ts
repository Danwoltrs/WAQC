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
