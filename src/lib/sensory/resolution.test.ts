import { describe, it, expect } from 'vitest'
import { buildSensoryResolution, parseSensoryResolution } from './resolution'
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
