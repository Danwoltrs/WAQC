import { describe, it, expect } from 'vitest'
import { firstHalf, secondHalf, previousHalfMonth, getCurrentWorkWeek, getPreviousWorkWeek, reportWindow, formatReportDay, lastReportDay, saoPauloYear } from './periods'

describe('firstHalf / secondHalf', () => {
  it('first half is the 1st through the 15th', () => {
    expect(firstHalf(2026, 0)).toEqual({ start: '2026-01-01', end: '2026-01-15' })
  })
  it('second half runs 16th to last day (31 in Jan)', () => {
    expect(secondHalf(2026, 0)).toEqual({ start: '2026-01-16', end: '2026-01-31' })
  })
  it('second half handles February length (28 in 2026)', () => {
    expect(secondHalf(2026, 1)).toEqual({ start: '2026-02-16', end: '2026-02-28' })
  })
})

describe('previousHalfMonth', () => {
  it('mid-month today (Jan 20) → previous completed half = Jan 1-15', () => {
    expect(previousHalfMonth(new Date(2026, 0, 20))).toEqual({
      start: '2026-01-01', end: '2026-01-15',
    })
  })
  it('early-month today (Jan 10) → previous completed half = prior month 2nd half (Dec 16-31)', () => {
    expect(previousHalfMonth(new Date(2026, 0, 10))).toEqual({
      start: '2025-12-16', end: '2025-12-31',
    })
  })
})

describe('work-week helpers', () => {
  // Wed Jul 1 2026, noon UTC — deterministic regardless of runner clock.
  const wednesday = new Date('2026-07-01T12:00:00Z')

  it('current work week is the surrounding Mon–Fri', () => {
    expect(getCurrentWorkWeek(wednesday)).toEqual({ start: '2026-06-29', end: '2026-07-03' })
  })
  it('previous work week is the Mon–Fri before', () => {
    expect(getPreviousWorkWeek(wednesday)).toEqual({ start: '2026-06-22', end: '2026-06-26' })
  })
  it('Sunday belongs to the week that started the previous Monday', () => {
    const sunday = new Date('2026-07-05T12:00:00Z')
    expect(getCurrentWorkWeek(sunday)).toEqual({ start: '2026-06-29', end: '2026-07-03' })
  })
})

describe('São Paulo report windows', () => {
  it('runs from São Paulo midnight of the first day to São Paulo midnight after the last', () => {
    expect(reportWindow('2026-09-21', '2026-09-25')).toEqual({
      start_date: '2026-09-21T03:00:00.000Z',
      end_date: '2026-09-26T03:00:00.000Z',
    })
  })

  it('crosses month and year ends', () => {
    expect(reportWindow('2026-12-16', '2026-12-31').end_date).toBe('2027-01-01T03:00:00.000Z')
  })

  it('labels Mon 21 – Fri 25 as Sep 21 – Sep 25 on any server clock', () => {
    const w = reportWindow('2026-09-21', '2026-09-25')
    expect(formatReportDay(w.start_date)).toBe('Sep 21')
    expect(formatReportDay(lastReportDay(w.end_date))).toBe('Sep 25')
  })

  it('labels São Paulo 1 January as Jan 01, and names its year', () => {
    expect(formatReportDay('2026-01-01T03:00:00.000Z')).toBe('Jan 01')
    expect(saoPauloYear('2026-01-01T02:59:59.999Z')).toBe(2025)
    expect(saoPauloYear('2026-01-01T03:00:00.000Z')).toBe(2026)
  })
})
