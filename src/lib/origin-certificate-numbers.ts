/**
 * Certificate numbers by origin: one line per origin, shared by every
 * laboratory and client (table origin_certificate_sequences, migration
 * 20261119000004). The database hands the numbers out; this file is the copy
 * of the format the screens use, and the checks on what an admin may type.
 *
 *     000123-COL/26          number, origin code, two-digit year
 *     SAG-000123-COL/26      with a client's quality code in front, for a
 *                            client whose own pattern puts one there
 *
 * An origin with no line (Brazil) keeps the per-client numbering.
 */

export interface OriginNumberLine {
  origin: string
  code: string
  /** The number the next certificate of this origin gets. */
  next_number: number
  counter_year: number
  /** The line goes back to 1 each January. */
  resets_yearly: boolean
  padding: number
  is_active: boolean
}

/** "000123-COL/26": the number `sequence` of this line, issued in `year`. */
export function formatOriginCertificateNumber(
  line: Pick<OriginNumberLine, 'code' | 'padding'>,
  sequence: number,
  year: number = new Date().getFullYear(),
  qualityPrefix = '',
): string {
  const digits = String(sequence)
  const padded = digits.length >= line.padding ? digits : digits.padStart(line.padding, '0')
  return `${qualityPrefix}${padded}-${line.code}/${String(year).slice(-2)}`
}

/** The number the next certificate of this line would get today. */
export function nextOriginCertificateNumber(line: OriginNumberLine, now: Date = new Date()): string {
  const year = now.getFullYear()
  // A line that restarts each January, and has not issued this year yet, starts over.
  const sequence = line.resets_yearly && line.counter_year !== year ? 1 : line.next_number
  return formatOriginCertificateNumber(line, sequence, year)
}

/** An origin code: one to six letters, stored upper-case. Null when it is anything else. */
export function cleanOriginCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{1,6}$/.test(code) ? code : null
}

/** A next number: a whole number from 1 up. Null when it is anything else. */
export function cleanNextNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 2_000_000_000 ? n : null
}

/** An origin name as an admin types it: trimmed, single-spaced, 60 characters at most. */
export function cleanOriginName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  return name.length > 0 && name.length <= 60 ? name : null
}
