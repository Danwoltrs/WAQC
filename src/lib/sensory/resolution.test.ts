import { describe, it, expect } from 'vitest'
import { buildSensoryResolution, gateResolutionForQuality, parseSensoryResolution } from './resolution'
import { PROFILE_NOTE_CAP, type RegionalProfile } from './types'

const choc = ['Nutty/Cocoa', 'Cocoa', 'Chocolate']
const cerrado: RegionalProfile = {
  id: 'p1', name: 'Cerrado Mineiro', origin: 'Brazil', region: 'Minas Gerais',
  notes: [choc, ['Sweet']], description: 'Chocolatey', is_active: true,
}
const base = { resolvedBy: 'u1', resolvedAt: '2026-11-13T10:00:00Z', source: 'validation' as const }

describe('buildSensoryResolution', () => {
  it('requires an answer when a profile is set', () => {
    expect(buildSensoryResolution({ notes: [choc], profile: cerrado, match: null, ...base }))
      .toEqual({ ok: false, error: 'profile_answer_required' })
  })
  it('sanitizes notes', () => {
    const r = buildSensoryResolution({ notes: [choc, ['bad']], profile: null, match: null, ...base })
    expect(r.ok && r.value.notes).toEqual([choc])
    expect(r.ok && r.value.profile).toBeNull()
    expect(r.ok && r.value.version).toBe(1)
  })
  it('snapshots the profile', () => {
    const r = buildSensoryResolution({ notes: [], profile: cerrado, match: false, ...base })
    expect(r.ok && r.value.profile).toEqual({
      id: 'p1', name: 'Cerrado Mineiro', region: 'Minas Gerais', notes: [choc, ['Sweet']], description: 'Chocolatey', match: false,
    })
  })
  it('caps profile notes', () => {
    const many = [['Sweet'], ['Sour'], ['Bitter'], ['Salty'], ['Umami'], choc, ['Sweet', 'Brown Sugar']]
    const r = buildSensoryResolution({ notes: [], profile: { ...cerrado, notes: many }, match: true, ...base })
    expect(r.ok && r.value.profile?.notes.length).toBeLessThanOrEqual(PROFILE_NOTE_CAP)
  })
})

describe('parseSensoryResolution', () => {
  it('rejects bad input', () => {
    expect(parseSensoryResolution({ version: 2 })).toBeNull()
    expect(parseSensoryResolution(null)).toBeNull()
    expect(parseSensoryResolution({ version: 1, notes: [], resolved_at: 'x', source: 'other' })).toBeNull()
  })
  it('round-trips a built resolution', () => {
    const r = buildSensoryResolution({ notes: [choc], profile: cerrado, match: true, ...base })
    if (!r.ok) throw new Error('x')
    expect(parseSensoryResolution(JSON.parse(JSON.stringify(r.value)))).toEqual(r.value)
  })
  it('drops a malformed profile and non-string resolved_by', () => {
    const p = parseSensoryResolution({ version: 1, notes: [choc, ['bad']], profile: { id: 'p', name: 'n', match: 'y' }, resolved_by: 5, resolved_at: 't', source: 'certificate_editor' })
    expect(p).toEqual({ version: 1, notes: [choc], profile: null, resolved_by: null, resolved_at: 't', source: 'certificate_editor' })
  })
})

describe('gateResolutionForQuality', () => {
  const frozen = () => {
    const r = buildSensoryResolution({ notes: [choc], profile: cerrado, match: true, ...base })
    if (!r.ok) throw new Error('build failed')
    return r.value
  }

  it('is null when nothing is frozen', () => {
    expect(gateResolutionForQuality(null, { notesEnabled: true, profile: { id: 'p1', name: 'X' } })).toBeNull()
  })

  it('keeps both when the quality asks for both, same profile id', () => {
    const r = frozen()
    expect(gateResolutionForQuality(r, { notesEnabled: true, profile: { id: 'p1', name: 'Renamed' } })).toEqual(r)
  })

  it('drops the notes when the quality has notes off', () => {
    const g = gateResolutionForQuality(frozen(), { notesEnabled: false, profile: { id: 'p1', name: 'P' } })
    expect(g?.notes).toEqual([])
    expect(g?.profile?.id).toBe('p1')
  })

  it('drops the profile when the quality has a different profile', () => {
    const g = gateResolutionForQuality(frozen(), { notesEnabled: true, profile: { id: 'p2', name: 'Other' } })
    expect(g?.notes).toEqual([choc])
    expect(g?.profile).toBeNull()
  })

  it('drops the profile when the quality has no profile', () => {
    const g = gateResolutionForQuality(frozen(), { notesEnabled: true, profile: null })
    expect(g?.profile).toBeNull()
  })

  it('is null when both end up empty', () => {
    expect(gateResolutionForQuality(frozen(), { notesEnabled: false, profile: null })).toBeNull()
    expect(gateResolutionForQuality(frozen(), { notesEnabled: false, profile: { id: 'p2', name: 'Other' } })).toBeNull()
  })

  it('is null when notes are on but none were frozen and the profile is gated out', () => {
    const r = buildSensoryResolution({ notes: [], profile: cerrado, match: false, ...base })
    if (!r.ok) throw new Error('build failed')
    expect(gateResolutionForQuality(r.value, { notesEnabled: true, profile: null })).toBeNull()
  })
})
