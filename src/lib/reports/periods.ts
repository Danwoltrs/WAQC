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
