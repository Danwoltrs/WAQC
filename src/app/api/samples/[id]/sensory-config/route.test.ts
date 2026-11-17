import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
const load = vi.hoisted(() => ({ loadSampleSensoryConfig: vi.fn() }))
vi.mock('@/lib/sensory/load-config', () => load)

import { GET } from './route'

const db = (user: { id: string } | null, visible = true) => ({
  auth: { getUser: async () => ({ data: { user }, error: null }) },
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: visible ? { id: 'lot-1' } : null, error: null }) }
    return chain
  },
})
const call = () => GET(new NextRequest('http://localhost/api/samples/lot-1/sensory-config'), { params: Promise.resolve({ id: 'lot-1' }) })

describe('GET /api/samples/[id]/sensory-config', () => {
  beforeEach(() => load.loadSampleSensoryConfig.mockReset())

  it('401 when signed out', async () => {
    state.db = db(null)
    expect((await call()).status).toBe(401)
  })

  it('404 and no loader call when the sample is not visible to the caller', async () => {
    state.db = db({ id: 'me' }, false)
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Sample not found' })
    expect(load.loadSampleSensoryConfig).not.toHaveBeenCalled()
  })

  it('returns the config', async () => {
    state.db = db({ id: 'me' })
    load.loadSampleSensoryConfig.mockResolvedValue({ notesEnabled: true, profile: null })
    let res: Response
    try { res = await call() } finally { load.loadSampleSensoryConfig.mockReset() }
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notesEnabled: true, profile: null })
  })

  it('fails soft to all off', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.db = db({ id: 'me' })
    load.loadSampleSensoryConfig.mockImplementation(() => { throw new Error('boom') })
    let res: Response
    try { res = await call() } finally { load.loadSampleSensoryConfig.mockReset() }
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notesEnabled: false, profile: null })
    err.mockRestore()
  })
})
