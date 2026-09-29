import { describe, it, expect, vi } from 'vitest'

/**
 * The intake's "New quality specification" dialog duplicates one of the
 * client's specifications and edits the copy before it exists (2026-09-29):
 * a contract says "15/16 FC", the client has 14/16 FINE CUP, and the copy
 * differs by its screen sizes. The name and the edited template fields travel
 * with the duplicate request, so a failure never leaves an unedited copy, and
 * the source template is never written to.
 */

const state = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))

import { POST } from './route'

type Op = { op: string; args: unknown[] }
type Query = { table: string; ops: Op[] }
type Result = { data: unknown; error: unknown }

/**
 * PostgREST stand-in: every query is recorded with its chained calls, and
 * `respond` decides what awaiting it yields.
 */
function fakeDb(respond: (q: Query) => Result, user: { id: string } | null = { id: 'user-1' }) {
  const queries: Query[] = []
  function chain(q: Query): any {
    return new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(respond(q)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          q.ops.push({ op: prop, args })
          return chain(q)
        }
      },
    })
  }
  return {
    queries,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) },
    from(table: string) {
      const q: Query = { table, ops: [] }
      queries.push(q)
      return chain(q)
    },
  }
}

const has = (q: Query, op: string) => q.ops.some((o) => o.op === op)
const arg = (q: Query, op: string) => q.ops.find((o) => o.op === op)?.args[0] as any

const SOURCE_TEMPLATE = {
  id: 'tpl-fc',
  name_en: '14/16 FINE CUP',
  name: '14/16 FINE CUP',
  description_en: 'Brazil 14/16 Fine Cup',
  sample_size_grams: 300,
  methodology: 'commodity',
  parameters: {
    origin: 'Brazil',
    screen_size_requirements: { constraints: [{ screen: '14', min: 90 }] },
    moisture_max: 12.5,
  },
}
const SOURCE = {
  id: 'cq-fc',
  client_id: 'co-cape',
  custom_name: '14/16 FINE CUP',
  quality_code: 'FC',
  cups_per_sample: 5,
  template: SOURCE_TEMPLATE,
}

/** A healthy database: the source spec, one sibling, and inserts that succeed. */
function healthy(overrides: { specInsertFails?: boolean } = {}) {
  return (q: Query): Result => {
    if (q.table === 'client_qualities' && has(q, 'single') && !has(q, 'insert')) return { data: SOURCE, error: null }
    if (q.table === 'client_qualities' && !has(q, 'insert')) {
      return { data: [{ custom_name: '14/16 FINE CUP' }, { custom_name: '17/18 FC' }], error: null }
    }
    if (q.table === 'quality_templates' && has(q, 'insert')) {
      return { data: { id: 'tpl-new', ...arg(q, 'insert') }, error: null }
    }
    if (q.table === 'client_qualities' && has(q, 'insert')) {
      return overrides.specInsertFails
        ? { data: null, error: { message: 'insert failed' } }
        : { data: { id: 'cq-new', ...arg(q, 'insert') }, error: null }
    }
    return { data: null, error: null }
  }
}

const request = (body?: unknown) =>
  new Request('http://localhost/api/client-qualities/cq-fc/duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  }) as any
const ctx = { params: Promise.resolve({ id: 'cq-fc' }) }

const EDITED_PARAMS = {
  origin: 'Brazil',
  screen_size_requirements: { constraints: [{ screen: '15', min: 90 }] },
  moisture_max: 12.5,
}

describe('POST /api/client-qualities/[id]/duplicate', () => {
  it('keeps the "(copy)" name when called without a body (the client page)', async () => {
    state.db = fakeDb(healthy())
    const res = await POST(request(), ctx)
    expect(res.status).toBe(201)
    expect((await res.json()).client_quality.custom_name).toBe('14/16 FINE CUP (copy)')
  })

  it('names the copy as asked and puts the edited parameters on the clone only', async () => {
    state.db = fakeDb(healthy())
    const res = await POST(request({
      custom_name: '15/16 FC',
      template: { parameters: EDITED_PARAMS, description_en: 'Brazil 15/16 Fine Cup' },
    }), ctx)
    expect(res.status).toBe(201)
    expect((await res.json()).client_quality).toMatchObject({ id: 'cq-new', custom_name: '15/16 FC', template_id: 'tpl-new' })

    const clone = state.db.queries.find((q: Query) => q.table === 'quality_templates' && has(q, 'insert'))
    expect(arg(clone, 'insert')).toMatchObject({
      name_en: '15/16 FC',
      name: '15/16 FC',
      description_en: 'Brazil 15/16 Fine Cup',
      parameters: EDITED_PARAMS,
      template_parent_id: 'tpl-fc',
      is_client_variant: true,
      is_global: false,
    })
    // The source template is only ever read.
    const writes = state.db.queries.filter((q: Query) =>
      q.table === 'quality_templates' && (has(q, 'update') || has(q, 'upsert')))
    expect(writes).toEqual([])
    expect(SOURCE_TEMPLATE.parameters.screen_size_requirements.constraints[0].screen).toBe('14')
  })

  it('refuses a name another of the client’s specifications already has', async () => {
    state.db = fakeDb(healthy())
    const res = await POST(request({ custom_name: '17/18 fc ' }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already has a specification named/)
    expect(state.db.queries.some((q: Query) => has(q, 'insert'))).toBe(false)
  })

  it('refuses parameters that are not an object', async () => {
    state.db = fakeDb(healthy())
    const res = await POST(request({ custom_name: '15/16 FC', template: { parameters: 'x' } }), ctx)
    expect(res.status).toBe(400)
    expect(state.db.queries.some((q: Query) => has(q, 'insert'))).toBe(false)
  })

  it('removes the clone when the specification cannot be created', async () => {
    state.db = fakeDb(healthy({ specInsertFails: true }))
    const res = await POST(request({ custom_name: '15/16 FC', template: { parameters: EDITED_PARAMS } }), ctx)
    expect(res.status).toBe(500)
    const del = state.db.queries.find((q: Query) => q.table === 'quality_templates' && has(q, 'delete'))
    expect(del?.ops).toContainEqual({ op: 'eq', args: ['id', 'tpl-new'] })
  })

  it('rejects an anonymous request', async () => {
    state.db = fakeDb(healthy(), null)
    expect((await POST(request(), ctx)).status).toBe(401)
    expect(state.db.queries).toEqual([])
  })
})
