/**
 * The laboratory whose QC settings a signed-in user reads and edits where no
 * sample is in hand: their own laboratory; a global admin or a user with no
 * laboratory gets the HQ's. Routes use this for every settings write, so the
 * laboratory never comes from a request body.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadLabScope } from '@/lib/auth/lab-scope'
import { loadHqLabId, settingsLabFor } from '@/lib/qc-settings/lab-row'

export async function loadSettingsLab(db: SupabaseClient, userId: string): Promise<string> {
  const [scope, hqLabId] = await Promise.all([loadLabScope(db, userId), loadHqLabId(db)])
  return settingsLabFor(scope, hqLabId)
}
