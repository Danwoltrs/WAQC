// src/components/portal/run-portal-action.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const t = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: t.error, warning: t.warning } }))

import { runPortalAction } from './run-portal-action'

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => { t.error.mockReset(); t.warning.mockReset() })

describe('runPortalAction', () => {
  it('sends JSON, reloads and answers true', async () => {
    const doFetch = answer(200, { ok: true })
    const reload = vi.fn(async () => {})
    expect(await runPortalAction(doFetch, '/x', 'PATCH', { views: ['qc_samples'] }, reload)).toBe(true)
    expect(doFetch).toHaveBeenCalledWith('/x', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ views: ['qc_samples'] }),
    })
    expect(reload).toHaveBeenCalled()
  })

  it('shows the server error and does not reload', async () => {
    const reload = vi.fn(async () => {})
    expect(await runPortalAction(answer(409, { error: 'Already on the team' }), '/x', 'POST', undefined, reload)).toBe(false)
    expect(t.error).toHaveBeenCalledWith('Already on the team')
    expect(reload).not.toHaveBeenCalled()
  })

  it('warns when the email could not be sent', async () => {
    await runPortalAction(answer(200, { ok: true, emailSent: false }), '/x', 'POST', undefined, vi.fn(async () => {}))
    expect(t.warning).toHaveBeenCalledWith('Saved, but the email could not be sent.')
  })

  it('shows a network error and answers false when the request throws', async () => {
    const reload = vi.fn(async () => {})
    const doFetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await runPortalAction(doFetch, '/x', 'DELETE', undefined, reload)).toBe(false)
    expect(t.error).toHaveBeenCalledWith('Could not reach the server. Please try again.')
    expect(reload).not.toHaveBeenCalled()
  })
})
