export const PROFILE_NOTE_CAP = 6
export const CUPPER_PICK_CAP = 5
export const RESOLVED_NOTE_CAP = 6

export interface RegionalProfile {
  id: string
  name: string
  origin: string | null
  region: string | null
  notes: string[][]
  description: string | null
  is_active: boolean
}

export interface QualitySensorySettings {
  notesEnabled: boolean
  profile: { id: string; name: string } | null
}

export interface CupperSensory {
  picks: string[][]
  profile_id: string | null
  profile_match: boolean | null
}

export interface SensoryResolution {
  version: 1
  notes: string[][]
  profile: {
    id: string
    name: string
    region: string | null
    notes: string[][]
    description: string | null
    match: boolean
  } | null
  resolved_by: string | null
  resolved_at: string
  source: 'validation' | 'certificate_editor'
}

export interface PanelSensoryRow {
  score_id: string
  cupper_id: string | null
  sensory: CupperSensory | null
}
