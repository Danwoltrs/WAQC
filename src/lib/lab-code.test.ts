import { describe, it, expect } from 'vitest'
import { labCodeBase, uniqueLabCode } from './lab-code'

describe('labCodeBase', () => {
  it('upper-cases and joins words with underscores, like SANTOS_HQ', () => {
    expect(labCodeBase('Santos HQ')).toBe('SANTOS_HQ')
  })

  it('strips accents so the code stays ascii', () => {
    expect(labCodeBase('Bogotá')).toBe('BOGOTA')
  })

  it('collapses punctuation and trims the ends', () => {
    expect(labCodeBase('  Wolthers Colombia S.A.S. ')).toBe('WOLTHERS_COLOMBIA_S_A_S')
  })

  it('caps the length at 24 without leaving a trailing underscore', () => {
    expect(labCodeBase('Guatemala City Laboratory Annex')).toBe('GUATEMALA_CITY_LABORATOR')
    // The 24th character is the underscore before "NORTE".
    expect(labCodeBase('Laboratorio Central Cal Norte')).toBe('LABORATORIO_CENTRAL_CAL')
  })

  it('returns null when nothing printable survives', () => {
    expect(labCodeBase('  ')).toBeNull()
    expect(labCodeBase(null)).toBeNull()
  })
})

describe('uniqueLabCode', () => {
  it('keeps the base when it is free', () => {
    expect(uniqueLabCode('BUENAVENTURA', ['SANTOS_HQ'])).toBe('BUENAVENTURA')
  })

  it('appends the next free number when the base is taken', () => {
    expect(uniqueLabCode('LIMA', ['LIMA', 'LIMA_2'])).toBe('LIMA_3')
  })

  it('compares case-insensitively', () => {
    expect(uniqueLabCode('LIMA', ['lima'])).toBe('LIMA_2')
  })
})
