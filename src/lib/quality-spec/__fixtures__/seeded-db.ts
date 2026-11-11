/**
 * Test-only PostgREST stand-in for the spec-version route tests: seeded rows
 * per table, narrowed by .eq/.is/.in/.gt/.gte/.lt/.lte (a dotted column reads an embedded row
 * seeded on the row), with insert/update/delete applied to the seed and
 * recorded, and rpc calls recorded. Embeds in .select() are ignored (rows come
 * back as seeded). Not imported by app code.
 */

export type Row = Record<string, any>
export type Write = { table: string; op: 'insert' | 'update' | 'delete'; values: Row | Row[] | null; filters: Filter[] }
type Filter = { col: string; test: (v: unknown) => boolean }
type Result = { data: unknown; error: unknown }

export interface SeededDbOptions {
  user?: { id: string } | null
  /** Result of an rpc call; default `{ data: 'version-id', error: null }`. */
  rpc?: (fn: string, args: Row) => Result
  /** Inject a failure for a table + operation ('select' for a read). */
  fail?: (table: string, op: Write['op'] | 'select') => { message: string; code?: string } | null
}

export function seededDb(rows: Record<string, Row[]>, opts: SeededDbOptions = {}) {
  const writes: Write[] = []
  const rpcCalls: Array<{ fn: string; args: Row }> = []
  let seq = 0
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user

  function from(table: string) {
    const filters: Filter[] = []
    let op: Write['op'] | null = null
    let values: Row | Row[] | null = null
    // A dotted column filters on an embedded row ('quality_templates.template_parent_id').
    const read = (r: Row, col: string) => col.split('.').reduce<any>((v, k) => (v == null ? v : v[k]), r)
    const matching = () => (rows[table] ?? []).filter((r) => filters.every((f) => f.test(read(r, f.col))))

    function settle(): Result {
      const failure = opts.fail?.(table, op ?? 'select') ?? null
      if (failure) return { data: null, error: failure }
      if (op === 'insert') {
        const list = (Array.isArray(values) ? values : [values]).map((v) => ({ id: `${table}-new-${++seq}`, ...v }))
        rows[table] = [...(rows[table] ?? []), ...list]
        writes.push({ table, op, values: list, filters: [] })
        return { data: list.map((r) => ({ ...r })), error: null }
      }
      if (op === 'update') {
        const hit = matching()
        for (const r of hit) Object.assign(r, values)
        writes.push({ table, op, values, filters: [...filters] })
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      if (op === 'delete') {
        const hit = new Set(matching())
        rows[table] = (rows[table] ?? []).filter((r) => !hit.has(r))
        writes.push({ table, op, values: null, filters: [...filters] })
        return { data: null, error: null }
      }
      // Copies, as PostgREST hands back: a later write never changes a row already read.
      return { data: matching().map((r) => ({ ...r })), error: null }
    }

    const one = (allowNone: boolean) => async (): Promise<Result> => {
      const res = settle()
      if (res.error) return res
      const [row] = (res.data as Row[] | null) ?? []
      if (row) return { data: row, error: null }
      return allowNone ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    }

    const chain: any = {
      select: () => chain,
      insert: (v: Row | Row[]) => { op = 'insert'; values = v; return chain },
      update: (v: Row) => { op = 'update'; values = v; return chain },
      delete: () => { op = 'delete'; return chain },
      eq: (col: string, v: unknown) => { filters.push({ col, test: (x) => x === v }); return chain },
      is: (col: string, v: unknown) => { filters.push({ col, test: (x) => (x ?? null) === v }); return chain },
      in: (col: string, vs: unknown[]) => { filters.push({ col, test: (x) => vs.includes(x) }); return chain },
      // Ranges compare as the stored strings do (YYYY-MM-DD dates, ISO timestamps); null never matches.
      gt: (col: string, v: any) => { filters.push({ col, test: (x: any) => x != null && x > v }); return chain },
      gte: (col: string, v: any) => { filters.push({ col, test: (x: any) => x != null && x >= v }); return chain },
      lt: (col: string, v: any) => { filters.push({ col, test: (x: any) => x != null && x < v }); return chain },
      lte: (col: string, v: any) => { filters.push({ col, test: (x: any) => x != null && x <= v }); return chain },
      order: () => chain,
      limit: () => chain,
      single: one(false),
      maybeSingle: one(true),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, ko),
    }
    return chain
  }

  return {
    rows,
    writes,
    rpcCalls,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from,
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args })
      return opts.rpc ? opts.rpc(fn, args) : { data: 'version-id', error: null }
    },
  }
}
