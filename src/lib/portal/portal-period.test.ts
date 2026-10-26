import { describe, expect, it } from 'vitest'
import { saoPauloMidnight } from '@/lib/reports/periods'
import { parsePortalPeriod, portalPeriodOptions } from './portal-period'

describe('parsePortalPeriod', () => {
  it('reads a crop year', () => {
    expect(parsePortalPeriod('crop-2026')).toEqual({
      key: 'crop-2026', label: 'Crop 26/27',
      start: saoPauloMidnight('2026-09-01'), end: saoPauloMidnight('2027-09-01'),
    })
  })
  it('reads a calendar year', () => {
    expect(parsePortalPeriod('year-2026')).toEqual({
      key: 'year-2026', label: '2026',
      start: saoPauloMidnight('2026-01-01'), end: saoPauloMidnight('2027-01-01'),
    })
  })
  it('falls back to the current crop year', () => {
    expect(parsePortalPeriod('garbage', new Date('2026-10-26T12:00:00Z')).key).toBe('crop-2026')
    expect(parsePortalPeriod(null, new Date('2026-08-31T12:00:00Z')).key).toBe('crop-2025')
  })
  it('uses the Sao Paulo month, not UTC', () => {
    // 2026-09-01T01:00Z is still Aug 31 in Sao Paulo
    expect(parsePortalPeriod(null, new Date('2026-09-01T01:00:00Z')).key).toBe('crop-2025')
  })
})

describe('portalPeriodOptions', () => {
  it('lists three crop years then two calendar years', () => {
    expect(portalPeriodOptions(new Date('2026-10-26T12:00:00Z')).map((p) => p.key))
      .toEqual(['crop-2026', 'crop-2025', 'crop-2024', 'year-2026', 'year-2025'])
  })
})
