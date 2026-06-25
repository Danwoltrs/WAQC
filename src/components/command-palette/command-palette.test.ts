import { describe, it, expect } from 'vitest'
import { getCommandScope } from './command-scope'
import { sampleOpenHref, certOpenHref, samplesFilterHref, certsFilterHref } from './selection'
import { filterNavTargets, NAV_TARGETS } from './nav-targets'

describe('getCommandScope', () => {
  it('maps /samples/* to samples', () => {
    expect(getCommandScope('/samples/qc')).toBe('samples')
    expect(getCommandScope('/samples/other')).toBe('samples')
  })
  it('maps /certificates to certificates', () => {
    expect(getCommandScope('/certificates')).toBe('certificates')
  })
  it('maps everything else to global', () => {
    expect(getCommandScope('/')).toBe('global')
    expect(getCommandScope('/dashboard/metrics/overview')).toBe('global')
    expect(getCommandScope('/clients')).toBe('global')
  })
})

describe('selection href builders', () => {
  it('builds open + filter hrefs with encoding', () => {
    expect(sampleOpenHref('abc-123')).toBe('/samples/qc?open=abc-123')
    expect(certOpenHref('abc-123')).toBe('/certificates?open=abc-123')
    expect(samplesFilterHref('42305/26')).toBe('/samples/qc?q=42305%2F26')
    expect(certsFilterHref('ED-001016/26')).toBe('/certificates?q=ED-001016%2F26')
  })
})

describe('filterNavTargets', () => {
  it('returns all targets for an empty query', () => {
    expect(filterNavTargets('')).toEqual(NAV_TARGETS)
  })
  it('matches by label substring, case-insensitive', () => {
    expect(filterNavTargets('cert').some((t) => t.href === '/certificates')).toBe(true)
  })
  it('returns nothing for a non-match', () => {
    expect(filterNavTargets('zzzzz')).toEqual([])
  })
})
