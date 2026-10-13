/**
 * A recording Supabase stand-in for route tests: each table answers with the
 * value given for it (an object for .single()/.maybeSingle() reads, an array
 * for lists), every chained call is logged, and rpc() answers per function.
 * A list honours .range(from, to), and `maxRows` caps every answer the way
 * PostgREST does (silently, at 1000 rows on this project).
 */
export interface FakeCall { table: string; op: string; args: unknown[] }
type Result = { data: unknown; error: unknown }

export function fakeSupabase(opts: {
  user?: { id: string } | null
  tables?: Record<string, unknown>
  rpc?: Record<string, Result>
  maxRows?: number
} = {}) {
  const calls: FakeCall[] = []
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user

  const chainFor = (table: string) => {
    let range: [number, number] | null = null
    const answer = (): Result => {
      const data = opts.tables?.[table] ?? null
      if (!Array.isArray(data)) return { data, error: null }
      const rows = range ? data.slice(range[0], range[1] + 1) : data
      return { data: opts.maxRows === undefined ? rows : rows.slice(0, opts.maxRows), error: null }
    }
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(answer()).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args })
          if (prop === 'range') range = [args[0] as number, args[1] as number]
          return chain
        }
      },
    })
    return chain
  }

  return {
    calls,
    rpcCalls,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from(table: string) {
      calls.push({ table, op: 'from', args: [] })
      return chainFor(table)
    },
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args })
      return opts.rpc?.[fn] ?? { data: [], error: null }
    },
  }
}
