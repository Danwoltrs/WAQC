/** How far back "Send unsent" reaches, chosen from the button's menu. */
export type SendWindow = '1d' | '1w' | '2w' | '4w'

export const SEND_WINDOWS: ReadonlyArray<{ value: SendWindow; label: string; description: string }> = [
  { value: '1d', label: '1d', description: 'Today' },
  { value: '1w', label: '1w', description: 'Last 7 days' },
  { value: '2w', label: '2w', description: 'Last 14 days' },
  { value: '4w', label: '4w', description: 'Last 28 days' },
]

/** The longest window a send may cover: four weeks, today included. */
export const MAX_SEND_WINDOW_DAYS = 28

const WINDOW_DAYS: Record<SendWindow, number> = { '1d': 1, '1w': 7, '2w': 14, '4w': MAX_SEND_WINDOW_DAYS }

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Shift a YYYY-MM-DD date by whole days — in UTC, where no day is 23 or 25 hours long. */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The issue dates a window covers, ending on `today` (the sender's local YYYY-MM-DD). "1d" is today alone. */
export function sendWindowRange(window: SendWindow, today: string): { from: string; to: string } {
  return { from: addDays(today, 1 - WINDOW_DAYS[window]), to: today }
}

/**
 * Server-side guard for a range-mode send queue: at most four weeks, counted back
 * from the requested end. A missing or malformed end is today; a missing,
 * malformed or earlier start is four weeks before the end — never "all time".
 */
export function clampSendRange(
  from: string | null,
  to: string | null,
  today: string,
): { from: string; to: string } {
  const end = to && YMD.test(to) ? to : today
  const earliest = addDays(end, 1 - MAX_SEND_WINDOW_DAYS)
  const start = from && YMD.test(from) && from > earliest ? from : earliest
  return { from: start, to: end }
}
