import { LABEL_TIME_ZONE } from '@/lib/sleeve-label-data'

/**
 * How far the label timezone is from UTC at a given instant, in milliseconds.
 * Positive east of UTC. Derived from Intl rather than hardcoded so the value
 * stays correct if Brazil ever reinstates DST.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LABEL_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const v = (type: string) => Number(parts.find(p => p.type === type)!.value)
  // hourCycle can yield 24 for midnight in some runtimes; normalise it.
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'), v('second'))
  return local - instant.getTime()
}

/**
 * The UTC instants bounding the laboratory's calendar day containing `now`.
 *
 * "Today's samples" has to mean today in Santos, not today in UTC — a
 * certificate issued at 21:00 local is already tomorrow in UTC and would drop
 * out of the batch the operator is standing there waiting for. Returning UTC
 * instants keeps the database query a plain range scan on an indexed column
 * rather than a per-row timezone conversion.
 *
 * Takes `now` as an argument so it stays pure and testable — the module never
 * reads an ambient clock.
 */
export function santosDayRangeUtc(now: Date): { startUtc: Date; endUtc: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LABEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const v = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const midnightAsIfUtc = new Date(Date.UTC(v('year'), v('month') - 1, v('day')))
  const startUtc = new Date(midnightAsIfUtc.getTime() - zoneOffsetMs(midnightAsIfUtc))
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)

  return { startUtc, endUtc }
}
