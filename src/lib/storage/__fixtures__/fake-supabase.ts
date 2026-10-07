/**
 * A recording Supabase stand-in for route tests: each table answers with the
 * value given for it (an object for .single()/.maybeSingle() reads, an array
 * for lists), every chained call is logged, and rpc() answers per function.
 */
export interface FakeCall { table: string; op: string; args: unknown[] }
type Result = { data: unknown; error: unknown }

export function fakeSupabase(opts: {
  user?: { id: string } | null
  tables?: Record<string, unknown>
  rpc?: Record<string, Result>
} = {}) {
  const calls: FakeCall[] = []
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user

  const chainFor = (table: string) => {
    const result: Result = { data: opts.tables?.[table] ?? null, error: null }
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args })
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
