import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalSessionEnded, portalFetch, withCarried, withCompany } from './portal-fetch'

afterEach(() => vi.unstubAllGlobals())

describe('withCompany', () => {
  it('adds or replaces the company and keeps other parameters', () => {
    expect(withCompany('/api/portal/samples', 'c1')).toBe('/api/portal/samples?company=c1')
    expect(withCompany('/api/portal/samples?q=42&company=old', 'c1')).toBe('/api/portal/samples?q=42&company=c1')
    expect(withCompany('/portal', null)).toBe('/portal')
  })
})

describe('withCarried', () => {
  it('keeps company, period and filters on the link', () => {
    expect(withCarried('/portal/certificates', 'c1', 'period=crop-2025&seller=OFI'))
      .toBe('/portal/certificates?company=c1&period=crop-2025&seller=OFI')
    expect(withCarried('/portal/certificates', 'c1', '')).toBe('/portal/certificates?company=c1')
  })
})

describe('portalFetch', () => {
  it('sends the person to sign in when the session has ended, instead of returning an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    const go = vi.fn()
    await expect(portalFetch('/api/portal/samples', 'c1', undefined, go)).rejects.toBeInstanceOf(PortalSessionEnded)
    expect(go).toHaveBeenCalledWith('/')
  })

  it('passes other answers through with the company attached', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await portalFetch('/api/portal/samples?q=1', 'c1', { method: 'GET' }, vi.fn())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/samples?q=1&company=c1', { method: 'GET' })
  })
})
