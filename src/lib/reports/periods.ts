/**
 * Half-month period helpers for the Bi-Weekly report.
 * All functions return YYYY-MM-DD strings (the format <input type="date"> uses).
 * "Half-month" = 1st–15th (first half) or 16th–end (second half).
 */

function iso(year: number, monthIndex0: number, day: number): string {
  const mm = String(monthIndex0 + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

export function firstHalf(year: number, monthIndex0: number): { start: string; end: string } {
  return { start: iso(year, monthIndex0, 1), end: iso(year, monthIndex0, 15) }
}

export function secondHalf(year: number, monthIndex0: number): { start: string; end: string } {
  return { start: iso(year, monthIndex0, 16), end: iso(year, monthIndex0, lastDayOfMonth(year, monthIndex0)) }
}

export function previousHalfMonth(today: Date): { start: string; end: string } {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  if (d <= 15) {
    // First half is still in progress → previous completed half is the prior month's 2nd half.
    const prevMonth = m === 0 ? 11 : m - 1
    const prevYear = m === 0 ? y - 1 : y
    return secondHalf(prevYear, prevMonth)
  }
  // We're in the 2nd half → previous completed half is this month's 1st half.
  return firstHalf(y, m)
}

// --- Work-week helpers ---
// "Work week" = Monday through Friday — the weekly reports were always cut
// on Friday for the just-completed Mon–Fri block. `today` is injectable for
// tests; date math is done in UTC on the ISO date so results are stable
// across timezones.

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function getCurrentWorkWeek(today: Date = new Date()): { start: string; end: string } {
  const d = new Date(today)
  const day = d.getUTCDay() // 0=Sun, 1=Mon, ...
  const offsetToMonday = day === 0 ? -6 : -(day - 1)
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + offsetToMonday)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  return { start: toIsoDate(monday), end: toIsoDate(friday) }
}

export function getPreviousWorkWeek(today: Date = new Date()): { start: string; end: string } {
  const { start } = getCurrentWorkWeek(today)
  const thisMonday = new Date(start)
  const prevMonday = new Date(thisMonday)
  prevMonday.setUTCDate(thisMonday.getUTCDate() - 7)
  const prevFriday = new Date(prevMonday)
  prevFriday.setUTCDate(prevMonday.getUTCDate() + 4)
  return { start: toIsoDate(prevMonday), end: toIsoDate(prevFriday) }
}

// --- Report windows in São Paulo days ---
// The labs, and the clients' own spreadsheets, count days in São Paulo. A
// window built from UTC midnights ran 21:00–21:00 local and, rendered on a
// São Paulo clock, labelled Mon 21 – Fri 25 as "Sep 20 – Sep 24" and 1 January
// as "Dec 31". Brazil has kept no daylight saving since 2019, so São Paulo
// midnight is always 03:00 UTC.

export const REPORT_TZ = 'America/Sao_Paulo'

/** São Paulo midnight at the start of `ymd` (YYYY-MM-DD), as an ISO instant. */
export function saoPauloMidnight(ymd: string): string {
  return `${ymd}T03:00:00.000Z`
}

/** The report window for the São Paulo days `startYmd`..`endYmd` inclusive:
 *  `end_date` is exclusive, São Paulo midnight after the last day. */
export function reportWindow(startYmd: string, endYmd: string): { start_date: string; end_date: string } {
  const next = new Date(`${endYmd}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return { start_date: saoPauloMidnight(startYmd), end_date: saoPauloMidnight(toIsoDate(next)) }
}

/** The São Paulo calendar day of an instant, as YYYY-MM-DD. */
export function reportDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: REPORT_TZ })
}

/** The São Paulo calendar year an instant falls in. */
export function saoPauloYear(iso: string): number {
  return Number(new Date(iso).toLocaleDateString('en-CA', { timeZone: REPORT_TZ }).slice(0, 4))
}

/** "Sep 21" — the São Paulo day of an instant. */
export function formatReportDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: REPORT_TZ, month: 'short', day: '2-digit' })
}

/** The last São Paulo day covered by an EXCLUSIVE end instant. */
export function lastReportDay(exclusiveEndIso: string): string {
  return new Date(new Date(exclusiveEndIso).getTime() - 1).toISOString()
}
