import { describe, it, expect } from 'vitest'
import { readSensorySettings, stripSensorySettings } from './settings'

describe('readSensorySettings', () => {
  it('is all off by default', () => {
    expect(readSensorySettings({}, {})).toEqual({ notesEnabled: false, profile: null })
    expect(readSensorySettings(undefined, 'junk')).toEqual({ notesEnabled: false, profile: null })
  })
  it('custom wins over template when it has the key', () => {
    expect(readSensorySettings({ sensory_notes_enabled: true }, { sensory_notes_enabled: false }).notesEnabled).toBe(true)
    expect(readSensorySettings({ sensory_notes_enabled: false }, { sensory_notes_enabled: true }).notesEnabled).toBe(false)
  })
  it('falls back to template per key', () => {
    expect(readSensorySettings({ sensory_notes_enabled: true }, { regional_profile: { id: 'p1', name: 'X' } }))
      .toEqual({ notesEnabled: true, profile: { id: 'p1', name: 'X' } })
    expect(readSensorySettings(null, { sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'Cerrado Mineiro' } }))
      .toEqual({ notesEnabled: true, profile: { id: 'p1', name: 'Cerrado Mineiro' } })
  })
  it('requires strictly true', () => {
    expect(readSensorySettings({ sensory_notes_enabled: 'true' }, null).notesEnabled).toBe(false)
    expect(readSensorySettings({ sensory_notes_enabled: 1 }, null).notesEnabled).toBe(false)
  })
  it('is all off for specialty', () => {
    expect(readSensorySettings(null, { sensory_notes_enabled: true, regional_profile: { id: 'p1', name: 'X' } }, 'cva'))
      .toEqual({ notesEnabled: false, profile: null })
  })
  it('rejects malformed profiles', () => {
    expect(readSensorySettings(null, { regional_profile: { id: '', name: 'X' } }).profile).toBeNull()
    expect(readSensorySettings(null, { regional_profile: { id: 'p', name: 3 } }).profile).toBeNull()
    expect(readSensorySettings(null, { regional_profile: 'p' }).profile).toBeNull()
  })
  it('a custom key set to undefined falls through to template', () => {
    expect(readSensorySettings({ sensory_notes_enabled: undefined }, { sensory_notes_enabled: true }).notesEnabled).toBe(true)
  })
})

describe('stripSensorySettings', () => {
  it('removes both keys without mutating', () => {
    const input = { a: 1, sensory_notes_enabled: true, regional_profile: { id: 'p', name: 'n' } }
    expect(stripSensorySettings(input)).toEqual({ a: 1 })
    expect(input.sensory_notes_enabled).toBe(true)
  })
})
