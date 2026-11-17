import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSampleSpec } from '@/lib/quality-spec/resolve'
import { readSensorySettings } from './settings'
import { sanitizePicks } from './picks'
import { PROFILE_NOTE_CAP, type RegionalProfile } from './types'

export interface SampleSensoryConfig {
  notesEnabled: boolean
  profile: RegionalProfile | null
}

const OFF: SampleSensoryConfig = { notesEnabled: false, profile: null }

/**
 * What the cupping card asks of a lot: whether cuppers pick notes, and which
 * regional profile they answer. Read from the lot's resolved spec. An inactive
 * or missing profile never breaks the card.
 */
export async function loadSampleSensoryConfig(supabase: SupabaseClient<any>, sampleId: string): Promise<SampleSensoryConfig> {
  const spec = await resolveSampleSpec(sampleId)
  if (!spec) return { ...OFF }
  const settings = readSensorySettings(spec.custom_parameters, spec.template?.parameters, spec.template?.methodology)
  if (!settings.profile) return { notesEnabled: settings.notesEnabled, profile: null }

  const { data, error } = await supabase
    .from('regional_profiles')
    .select('id, name, origin, region, notes, description, is_active')
    .eq('id', settings.profile.id)
    .maybeSingle()
  if (error) {
    console.warn('[sensory-config] could not read the regional profile:', error.code ?? error.message)
    return { notesEnabled: settings.notesEnabled, profile: null }
  }
  if (!data) return { notesEnabled: settings.notesEnabled, profile: null }
  const row = data as RegionalProfile
  return { notesEnabled: settings.notesEnabled, profile: { ...row, notes: sanitizePicks(row.notes, PROFILE_NOTE_CAP) } }
}
