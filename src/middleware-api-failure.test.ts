// @vitest-environment node
// src/middleware-api-failure.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/ssr', () => ({ createServerClient: () => { throw new Error('boom') } }))

import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie } } : undefined)

describe('middleware: unexpected exception', () => {
  it('an API call with a session cookie gets 503 instead of continuing unchecked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await middleware(req('/api/samples', 'sb-abc-auth-token=x'))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('Access check failed, please retry')
  })

  it('a page still fails closed (redirect)', async () => {
    const res = await middleware(req('/samples', 'sb-abc-auth-token=x'))
    expect(res.status).toBe(307)
  })

  it('an API call without a session cookie is not turned into a 503', async () => {
    const res = await middleware(req('/api/samples'))
    expect(res.status).not.toBe(503)
  })
})
