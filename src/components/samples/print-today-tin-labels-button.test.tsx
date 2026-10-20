// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, renderHook } from '@testing-library/react'
import { PrintTodayTinLabelsButton, useTodayTinBatch } from './print-today-tin-labels-button'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sample_ids: ['a', 'b'] }) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PrintTodayTinLabelsButton', () => {
  it('the Today button still shows the count', async () => {
    render(<PrintTodayTinLabelsButton />)
    expect(await screen.findByText('Today · 2')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/samples/tin-labels/pending-today')
  })
})

describe('useTodayTinBatch', () => {
  it('exposes ids and loaded', async () => {
    const { result } = renderHook(() => useTodayTinBatch())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.sampleIds).toEqual(['a', 'b'])
    expect(result.current.error).toBeNull()
  })

  it('exposes the error when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'nope' }) })
    const { result } = renderHook(() => useTodayTinBatch())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.error).toBe('nope')
    expect(result.current.sampleIds).toEqual([])
  })
})
