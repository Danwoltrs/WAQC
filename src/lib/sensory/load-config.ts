import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSampleSpec } from '@/lib/quality-spec/resolve'
import { readSensorySettings } from './settings'
import { sanitizePicks } from './picks'
import { PROFILE_NOTE_CAP, type RegionalProfile } from './types'

export interface SampleSensoryConfig {
  notesEnabled: boolean
  profile: RegionalProfile | null
  /**
   * Whether the lot's quality has a regional profile that must be answered.
   * True with `profile` null means the row exists in principle but the read
   * FAILED (callers refuse with 503). A profile id whose row is not found
   * counts as no profile: false.
   */
  profileConfigured: boolean
}

const OFF: SampleSensoryConfig = { notesEnabled: false, profile: null, profileConfigured: false }

/**
 * What the cupping card asks of a lot: whether cuppers pick notes, and which
 * regional profile they answer. Read from the lot's resolved spec. An inactive
 * or missing profile never breaks the card.
 */
export async function loadSampleSensoryConfig(supabase: SupabaseClient<any>, sampleId: string): Promise<SampleSensoryConfig> {
  const spec = await resolveSampleSpec(sampleId)
  if (!spec) return { ...OFF }
  const settings = readSensorySettings(spec.custom_parameters, spec.template?.parameters, spec.template?.methodology)
  if (!settings.profile) return { notesEnabled: settings.notesEnabled, profile: null, profileConfigured: false }

  const { data, error } = await supabase
    .from('regional_profiles')
    .select('id, name, origin, region, notes, description, is_active')
    .eq('id', settings.profile.id)
    .maybeSingle()
  // 22P02: the stored id is not even a uuid, so no row can ever match: the
  // same as not found below, never a retryable read error.
  if (error && error.code !== '22P02') {
    console.warn('[sensory-config] could not read the regional profile:', error.code ?? error.message)
    return { notesEnabled: settings.notesEnabled, profile: null, profileConfigured: true }
  }
  // The id points at no row (deleted, or not a uuid): no profile, the same as
  // none set, so finalize never waits on an answer nobody can give. Only a
  // real read error above stays "configured" (callers refuse with 503).
  if (error || !data) return { notesEnabled: settings.notesEnabled, profile: null, profileConfigured: false }
  const row = data as RegionalProfile
  return {
    notesEnabled: settings.notesEnabled,
    profile: { ...row, notes: sanitizePicks(row.notes, PROFILE_NOTE_CAP) },
    profileConfigured: true,
  }
}
