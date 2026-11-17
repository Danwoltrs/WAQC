import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSensoryCard } from './use-sensory-card'

afterEach(() => vi.unstubAllGlobals())

describe('useSensoryCard', () => {
  it('seeds values without waiting on the configs, then publishes configs when they land', async () => {
    let release!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => { release = res })))
    const { result } = renderHook(() => useSensoryCard())

    let pending!: Promise<void>
    act(() => { pending = result.current.fetchConfigs(['s1']) })
    act(() => result.current.seedValues(['s1'], { s1: { sensory: { picks: [['Sweet', 'Brown Sugar']], profile_id: 'p1', profile_match: true } } }))
    expect(result.current.valueMap.s1?.profile_match).toBe(true)
    expect(result.current.configMap).toEqual({})

    await act(async () => {
      release(new Response(JSON.stringify({ notesEnabled: true, profile: null }), { status: 200 }))
      await pending
    })
    expect(result.current.configMap.s1).toEqual({ notesEnabled: true, profile: null })
  })

  it('falls back to all off when the config request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const { result } = renderHook(() => useSensoryCard())
    await act(async () => { await result.current.fetchConfigs(['s1']) })
    expect(result.current.configMap.s1).toEqual({ notesEnabled: false, profile: null })
  })

  it('a config request that never answers settles to all off after about 8 s', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
      const { result } = renderHook(() => useSensoryCard())
      let pending!: Promise<void>
      act(() => { pending = result.current.fetchConfigs(['s1', 's2']) })
      await act(async () => { await vi.advanceTimersByTimeAsync(7900) })
      expect(result.current.configMap).toEqual({})
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
        await pending
      })
      expect(result.current.configMap).toEqual({ s1: { notesEnabled: false, profile: null }, s2: { notesEnabled: false, profile: null } })
    } finally {
      vi.useRealTimers()
    }
  })
})
