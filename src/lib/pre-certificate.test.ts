import { describe, it, expect } from 'vitest'
import {
  cleanContainerNumber,
  daysWaiting,
  icoRequiredAtIntake,
  isOnStandby,
  isPreCertificate,
  startsOnStandby,
} from './pre-certificate'

const lot = { labPreCertCheck: true, isRejected: false, sampleType: 'pss', containerNr: null }

describe('which certificates start on standby', () => {
  it('an approved lot in a laboratory with the check on', () => {
    expect(startsOnStandby(lot)).toBe(true)
  })
  it('never in a laboratory with the check off (Brazil), nor when the setting is unknown', () => {
    expect(startsOnStandby({ ...lot, labPreCertCheck: false })).toBe(false)
    expect(startsOnStandby({ ...lot, labPreCertCheck: null })).toBe(false)
    expect(startsOnStandby({ ...lot, labPreCertCheck: undefined })).toBe(false)
  })
  it('a rejected lot gets its ordinary rejection certificate at once', () => {
    expect(startsOnStandby({ ...lot, isRejected: true })).toBe(false)
  })
  it('a type sample has no verdict and no container: never a pre-certificate', () => {
    expect(startsOnStandby({ ...lot, sampleType: 'type' })).toBe(false)
  })
  it('a lot that already names its container has nothing to wait for', () => {
    expect(startsOnStandby({ ...lot, containerNr: 'MSKU1234567' })).toBe(false)
    expect(startsOnStandby({ ...lot, containerNr: '   ' })).toBe(true)
  })
})

describe('the state of a pre-certificate', () => {
  it('waits until it is finalized, and stays a pre-certificate afterwards', () => {
    const waiting = { status: 'draft', standby_at: '2026-11-10T10:00:00Z', finalized_at: null }
    const final = { status: 'issued', standby_at: '2026-11-10T10:00:00Z', finalized_at: '2026-11-15T10:00:00Z' }
    expect(isOnStandby(waiting)).toBe(true)
    expect(isOnStandby(final)).toBe(false)
    expect(isPreCertificate(final)).toBe(true)
    expect(isPreCertificate({ status: 'issued', standby_at: null })).toBe(false)
    expect(isOnStandby(null)).toBe(false)
  })

  it('counts whole days waiting', () => {
    const now = new Date('2026-11-19T12:00:00Z')
    expect(daysWaiting('2026-11-19T08:00:00Z', now)).toBe(0)
    expect(daysWaiting('2026-11-10T12:00:00Z', now)).toBe(9)
    expect(daysWaiting(null, now)).toBeNull()
    expect(daysWaiting('not a date', now)).toBeNull()
  })
})

describe('container numbers', () => {
  it('are stored upper-case without spaces or dashes', () => {
    expect(cleanContainerNumber(' msku 123456-7 ')).toBe('MSKU1234567')
  })
  it('refuse an empty or unusable entry', () => {
    expect(cleanContainerNumber('')).toBeNull()
    expect(cleanContainerNumber('ab')).toBeNull()
    expect(cleanContainerNumber('MSKU/123')).toBeNull()
    expect(cleanContainerNumber(null)).toBeNull()
  })
})

describe('ICO at intake', () => {
  it('is required for a lot in a laboratory with the check on', () => {
    expect(icoRequiredAtIntake({ labPreCertCheck: true, sampleType: 'pss' })).toBe(true)
    expect(icoRequiredAtIntake({ labPreCertCheck: true, sampleType: 'ss', sampleCategory: 'qc' })).toBe(true)
  })
  it('is not for a type sample, an Other sample, or a laboratory with the check off', () => {
    expect(icoRequiredAtIntake({ labPreCertCheck: true, sampleType: 'type' })).toBe(false)
    expect(icoRequiredAtIntake({ labPreCertCheck: true, sampleType: 'pss', sampleCategory: 'other' })).toBe(false)
    expect(icoRequiredAtIntake({ labPreCertCheck: false, sampleType: 'pss' })).toBe(false)
  })
})
