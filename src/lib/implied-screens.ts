// src/lib/implied-screens.ts
//
// Screens between two defined screens are always shown, even when the spec
// does not list them (Daniel 2026-09-29): "Screen 18 ≥ 35%, Screen 16 ≥ 40%,
// Pan ≤ 5%" also grades and shows Screen 17, as "any amount". The lab may
// still list an in-between screen (to give it a requirement); it never has to.
//
// Only numbered screens fill in. Pan and Peas never do, and nothing is added
// above the highest or below the lowest defined screen. The added rows take
// the neighbours' spelling ("Screen 17" beside "Screen 18", "17" beside "18")
// so grading keys and compliance lookups stay consistent.
//
// Pure: the spec editor, the grading form and the template view share it.

interface ScreenRow {
  screen_size: string
  constraint_type: string
}

export type ImpliedScreenRow = {
  screen_size: string
  constraint_type: 'any'
  /** Not stored in the spec: shown because it lies between defined screens. */
  implied: true
}

/** The screen number of a row ("Screen 17", "17" → 17); null for Pan and Peas. */
export function screenNumberOf(size: unknown): number | null {
  const s = String(size ?? '').trim()
  if (/pan|pea/i.test(s)) return null
  const m = s.match(/^(?:screen\s*|scr\.?\s*)?(\d{2})$/i)
  return m ? Number(m[1]) : null
}

/** The rows with every missing screen between the defined ones added. */
export function withImpliedScreens<T extends ScreenRow>(rows: T[]): Array<T | ImpliedScreenRow> {
  const numbered = rows
    .map((r) => ({ row: r, n: screenNumberOf(r.screen_size) }))
    .filter((x): x is { row: T; n: number } => x.n != null)
  if (numbered.length < 2) return [...rows]

  const present = new Set(numbered.map((x) => x.n))
  const top = numbered.reduce((a, b) => (b.n > a.n ? b : a))
  const lowest = Math.min(...present)
  const spell = (n: number) => top.row.screen_size.replace(/\d{2}/, String(n))

  const implied: ImpliedScreenRow[] = []
  for (let n = top.n - 1; n > lowest; n--) {
    if (!present.has(n)) implied.push({ screen_size: spell(n), constraint_type: 'any', implied: true })
  }
  return [...rows, ...implied]
}

export function isImpliedScreen(row: unknown): row is ImpliedScreenRow {
  return !!row && (row as ImpliedScreenRow).implied === true
}
