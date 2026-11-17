import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSensoryConfig, SENSORY_CONFIG_TIMEOUT_MS } from './fetch-config'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

describe('fetchSensoryConfig', () => {
  it('reads the three fields from the lot it is asked about', async () => {
    const fetchMock = vi.fn(async () => ok({ notesEnabled: true, profile: null, profileConfigured: true }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchSensoryConfig('lab-1')).toEqual({ notesEnabled: true, profile: null, profileConfigured: true })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/samples/lab-1/sensory-config')
  })

  it('defaults a missing field to off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ notesEnabled: true })))
    expect(await fetchSensoryConfig('s1')).toEqual({ notesEnabled: true, profile: null, profileConfigured: false })
  })

  it('is null on a non-OK answer or a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    expect(await fetchSensoryConfig('s1')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await fetchSensoryConfig('s1')).toBeNull()
  })

  it('gives up after the timeout and aborts the request, even if the fetch never settles', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }))
    let settled: unknown = 'pending'
    const p = fetchSensoryConfig('s1').then((v) => (settled = v))
    await vi.advanceTimersByTimeAsync(SENSORY_CONFIG_TIMEOUT_MS - 1)
    expect(settled).toBe('pending')
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(settled).toBeNull()
    expect(signal?.aborted).toBe(true)
  })

  it('waits about 8 seconds by default', () => {
    expect(SENSORY_CONFIG_TIMEOUT_MS).toBe(8000)
  })
})
