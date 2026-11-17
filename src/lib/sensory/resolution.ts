import { sanitizePicks } from './picks'
import { PROFILE_NOTE_CAP, RESOLVED_NOTE_CAP, type RegionalProfile, type SensoryResolution } from './types'

export function buildSensoryResolution(input: {
  notes: unknown
  profile: RegionalProfile | null
  match: boolean | null
  resolvedBy: string | null
  resolvedAt: string
  source: SensoryResolution['source']
}): { ok: true; value: SensoryResolution } | { ok: false; error: 'profile_answer_required' } {
  if (input.profile && typeof input.match !== 'boolean') return { ok: false, error: 'profile_answer_required' }
  const p = input.profile
  return {
    ok: true,
    value: {
      version: 1,
      notes: sanitizePicks(input.notes, RESOLVED_NOTE_CAP),
      profile: p
        ? {
            id: p.id,
            name: p.name,
            region: p.region,
            notes: sanitizePicks(p.notes, PROFILE_NOTE_CAP),
            description: p.description,
            match: input.match as boolean,
          }
        : null,
      resolved_by: input.resolvedBy,
      resolved_at: input.resolvedAt,
      source: input.source,
    },
  }
}

export function parseSensoryResolution(raw: unknown): SensoryResolution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || !Array.isArray(r.notes) || typeof r.resolved_at !== 'string') return null
  if (r.source !== 'validation' && r.source !== 'certificate_editor') return null
  let profile: SensoryResolution['profile'] = null
  const p = r.profile
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const q = p as Record<string, unknown>
    if (typeof q.id === 'string' && typeof q.name === 'string' && typeof q.match === 'boolean') {
      profile = {
        id: q.id,
        name: q.name,
        region: typeof q.region === 'string' ? q.region : null,
        notes: sanitizePicks(q.notes, PROFILE_NOTE_CAP),
        description: typeof q.description === 'string' ? q.description : null,
        match: q.match,
      }
    }
  }
  return {
    version: 1,
    notes: sanitizePicks(r.notes, RESOLVED_NOTE_CAP),
    profile,
    resolved_by: typeof r.resolved_by === 'string' ? r.resolved_by : null,
    resolved_at: r.resolved_at,
    source: r.source,
  }
}
