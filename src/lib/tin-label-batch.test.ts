import { describe, it, expect } from 'vitest'
import { santosDayRangeUtc } from './tin-label-batch'

describe('santosDayRangeUtc', () => {
  it('spans Santos midnight to Santos midnight, expressed in UTC', () => {
    // Santos is UTC-3, so 6 Aug 00:00 local is 6 Aug 03:00 UTC.
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    expect(startUtc.toISOString()).toBe('2026-08-06T03:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-08-07T03:00:00.000Z')
  })

  it('treats the small hours UTC as the previous Santos day', () => {
    // 02:00 UTC on 6 Aug is 23:00 on 5 Aug in Santos.
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-08-06T02:00:00.000Z'))
    expect(startUtc.toISOString()).toBe('2026-08-05T03:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-08-06T03:00:00.000Z')
  })

  it('is exactly 24 hours wide', () => {
    const { startUtc, endUtc } = santosDayRangeUtc(new Date('2026-01-15T09:30:00.000Z'))
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('is a pure function of its argument', () => {
    const a = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    const b = santosDayRangeUtc(new Date('2026-08-06T12:00:00.000Z'))
    expect(a.startUtc.toISOString()).toBe(b.startUtc.toISOString())
  })
})
