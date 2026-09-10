import { describe, it, expect } from 'vitest'
import { nextReference, suggestContractRefs, SUGGESTED_REF_FIELDS } from './reference-sequence'

describe('nextReference — single seed increments the first digit run', () => {
  it.each([
    ['50235-1', '50236-1'],
    ['1235-231', '1236-231'],
    ['56542/26', '56543/26'],
    ['IR0007506-1', 'IR0007507-1'],
    ['130306', '130307'],
    ['S664243-13', 'S664244-13'],
    ['AB-0099', 'AB-0100'],
    ['0999', '1000'],
  ])('%s → %s', (prev, next) => expect(nextReference(prev)).toBe(next))

  it('returns null without digits or input', () => {
    expect(nextReference('TBI')).toBeNull()
    expect(nextReference('')).toBeNull()
    expect(nextReference(null)).toBeNull()
    expect(nextReference(undefined)).toBeNull()
  })
})

describe('nextReference — two seeds continue the run that changed', () => {
  it.each([
    ['S664243-14', 'S664243-13', 'S664243-15'],
    ['S049504-16', 'S049504-14', 'S049504-18'],
    ['5229', '5228', '5230'],
    ['41859/26', '41858/26', '41860/26'],
    ['IR0007507-1', 'IR0007506-1', 'IR0007508-1'],
  ])('%s after %s → %s', (prev, before, next) => expect(nextReference(prev, before)).toBe(next))

  it('falls back to the first-run rule when the shapes differ or nothing changed', () => {
    expect(nextReference('S664243-14', 'X-1')).toBe('S664244-14')
    expect(nextReference('S664243-14', 'S664243-14')).toBe('S664244-14')
  })

  it('gives up when several runs changed', () => {
    expect(nextReference('S664244-15', 'S664243-13')).toBeNull()
  })

  it('never steps backwards', () => {
    expect(nextReference('S664243-13', 'S664243-14')).toBe('S664244-13')
  })
})

describe('suggestContractRefs', () => {
  // Contract numbers were removed from SUGGESTED_REF_FIELDS on 2026-09-10:
  // guessing "41966/26 -> 41967/26" for a number nobody read off the paperwork
  // is how a wrong contract number reached a certificate. Only the exporter's
  // own sample number - a lab-side counter - is still stepped.
  it('steps the exporter sample number', () => {
    expect(suggestContractRefs({ exporter_sample_number: '130306' })).toEqual({
      exporter_sample_number: '130307',
    })
  })
  it('skips a blank sample number', () => {
    expect(suggestContractRefs({ exporter_sample_number: '' })).toEqual({})
  })
  it('uses the pair rule', () => {
    expect(suggestContractRefs(
      { exporter_sample_number: '130308' },
      { exporter_sample_number: '130306' },
    )).toEqual({ exporter_sample_number: '130310' })
  })
  it('never suggests a contract number', () => {
    expect(SUGGESTED_REF_FIELDS).toEqual(['exporter_sample_number'])
  })
})
