/**
 * Test-only PostgREST stand-in for the seller-requests store: seeded rows per
 * table, .eq/.is/.in/.or (id.eq.X,lab_source_sample_id.eq.X) filters, updates
 * applied to the seed and recorded. A select whose column list names a column
 * in `missingColumns[table]` fails with 42703, as the live DB does before the
 * migration. `failUpdate(table, id)` injects a write error.
 */
export type Row = Record<string, any>

export function fakeDb(
  rows: Record<string, Row[]>,
  opts: { missingColumns?: Record<string, string[]>; failUpdate?: (table: string, id: unknown) => boolean; failSelect?: (table: string) => boolean } = {},
) {
  const writes: Array<{ table: string; values: Row; id: unknown }> = []
  const selects: Array<{ table: string; columns: string }> = []
  return {
    rows, writes, selects,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let columns = '*'
      let pending: Row | null = null
      const matching = () => (rows[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const settle = () => {
        if (pending) {
          const hit = matching()
          if (hit.length === 1 && opts.failUpdate?.(table, hit[0].id)) {
            return { data: null, error: { message: 'write failed', code: 'XX000' } }
          }
          for (const r of hit) { Object.assign(r, pending); writes.push({ table, values: pending, id: r.id }) }
          return { data: hit.map((r) => ({ ...r })), error: null }
        }
        if (opts.failSelect?.(table)) return { data: null, error: { code: '57014', message: 'transient failure' } }
        const missing = (opts.missingColumns?.[table] ?? []).find((c) => columns.split(/[\s,]+/).includes(c))
        if (missing) return { data: null, error: { code: '42703', message: `column ${missing} does not exist` } }
        return { data: matching().map((r) => ({ ...r })), error: null }
      }
      const chain: any = {
        select(c?: string) { if (c) { columns = c; selects.push({ table, columns: c }) } return chain },
        update(v: Row) { pending = v; return chain },
        eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return chain },
        is(col: string, v: unknown) { filters.push((r) => (r[col] ?? null) === v); return chain },
        in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return chain },
        or(expr: string) {
          const cl = expr.split(',').map((p) => { const [col, , value] = p.split('.'); return { col, value } })
          filters.push((r) => cl.some((c) => r[c.col] === c.value))
          return chain
        },
        order() { return chain },
        limit() { return chain },
        maybeSingle: async () => { const s = settle(); return s.error ? s : { data: (s.data as Row[])[0] ?? null, error: null } },
        single: async () => { const s = settle(); return s.error ? s : { data: (s.data as Row[])[0] ?? null, error: null } },
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) { return Promise.resolve(settle()).then(ok, ko) },
      }
      return chain
    },
  }
}
