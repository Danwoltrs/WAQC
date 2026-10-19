import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePrintList } from './use-print-list'
import {
  MAX_PRINT_LIST,
  readPrintList,
  writePrintList,
  type PrintListEntry,
  type PrintListSource,
} from '@/lib/print-list'
import { certificateListUrl } from '@/lib/certificate-list-query'

const entry = (id: string): PrintListEntry => ({
  id,
  certificate_number: `SAG-${id}/26`,
  sample_id: `s-${id}`,
  lab_source_sample_id: null,
  client_name: null,
  contract_ref: null,
  buyer_id: null,
  seller_id: null,
})
const apiCert = (id: string): PrintListSource => ({
  id,
  certificate_number: `SAG-${id}/26`,
  sample_id: `s-${id}`,
})
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePrintList', () => {
  it('restores the stored list, refreshed, and says how many left', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1'), entry('c2')])
    fetchMock.mockResolvedValue(json({ certificates: [apiCert('c2')], total: 1 }))
    const onRestored = vi.fn()
    const { result } = renderHook(() => usePrintList('u-1', { onRestored }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(certificateListUrl({ ids: ['c1', 'c2'] }), expect.anything())
    expect(result.current.entries.map((e) => e.id)).toEqual(['c2'])
    expect(onRestored).toHaveBeenCalledWith({ kept: 1, dropped: 1 })
    expect(readPrintList(localStorage, 'u-1').map((e) => e.id)).toEqual(['c2'])
  })

  it('keeps the stored order although the API answers in another order', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1'), entry('c2'), entry('c3')])
    fetchMock.mockResolvedValue(
      json({ certificates: [apiCert('c3'), apiCert('c1'), apiCert('c2')], total: 3 }),
    )
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.entries.map((e) => e.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('keeps the stored list when the refresh fails', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1'), entry('c2')])
    fetchMock.mockRejectedValue(new Error('offline'))
    const onRestored = vi.fn()
    const { result } = renderHook(() => usePrintList('u-1', { onRestored }))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.entries.map((e) => e.id)).toEqual(['c1', 'c2'])
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('keeps the stored list on a non-200 answer', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1')])
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.entries.map((e) => e.id)).toEqual(['c1'])
  })

  it('dedupes stored duplicates and does not fetch an empty list', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1'), entry('c1')])
    fetchMock.mockResolvedValue(json({ certificates: [apiCert('c1')], total: 1 }))
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(certificateListUrl({ ids: ['c1'] }), expect.anything())
    expect(result.current.count).toBe(1)

    const empty = renderHook(() => usePrintList('u-9'))
    await waitFor(() => expect(empty.result.current.ready).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('toggle adds then removes, and persists', async () => {
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => {
      expect(result.current.toggle(apiCert('c3'))).toBe(true)
    })
    expect(result.current.has('c3')).toBe(true)
    expect(readPrintList(localStorage, 'u-1').map((e) => e.id)).toEqual(['c3'])
    act(() => {
      result.current.toggle(apiCert('c3'))
    })
    expect(result.current.has('c3')).toBe(false)
    expect(readPrintList(localStorage, 'u-1')).toEqual([])
  })

  it('refuses the 301st certificate', async () => {
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    const many = Array.from({ length: MAX_PRINT_LIST + 5 }, (_, i) => apiCert(`k${i}`))
    let added = 0
    act(() => {
      added = result.current.addMany(many)
    })
    expect(added).toBe(MAX_PRINT_LIST)
    expect(result.current.count).toBe(MAX_PRINT_LIST)
    expect(result.current.full).toBe(true)
    let ok = true
    act(() => {
      ok = result.current.toggle(apiCert('extra'))
    })
    expect(ok).toBe(false)
    expect(result.current.count).toBe(MAX_PRINT_LIST)
    expect(readPrintList(localStorage, 'u-1')).toHaveLength(MAX_PRINT_LIST)
  })

  it('addMany skips duplicates; removeMany, remove and clear work', async () => {
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    let added = 0
    act(() => {
      added = result.current.addMany([apiCert('a'), apiCert('b'), apiCert('a')])
    })
    expect(added).toBe(2)
    act(() => {
      added = result.current.addMany([apiCert('b'), apiCert('c'), apiCert('d')])
    })
    expect(added).toBe(2)
    act(() => result.current.removeMany(['a', 'b']))
    expect(result.current.entries.map((e) => e.id)).toEqual(['c', 'd'])
    act(() => result.current.remove('c'))
    expect(result.current.entries.map((e) => e.id)).toEqual(['d'])
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
    expect(readPrintList(localStorage, 'u-1')).toEqual([])
  })

  it('restore replaces the list, capped and deduped', async () => {
    const { result } = renderHook(() => usePrintList('u-1'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    act(() => result.current.restore([entry('x'), entry('x'), entry('y')]))
    expect(result.current.entries.map((e) => e.id)).toEqual(['x', 'y'])
    expect(readPrintList(localStorage, 'u-1').map((e) => e.id)).toEqual(['x', 'y'])
  })

  it('another user on the same browser starts with their own list', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1')])
    const { result } = renderHook(() => usePrintList('u-2'))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.entries).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readPrintList(localStorage, 'u-1').map((e) => e.id)).toEqual(['c1'])
  })

  it('switching user never writes the previous list under the new key', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1')])
    fetchMock.mockResolvedValue(json({ certificates: [apiCert('c1')], total: 1 }))
    const { result, rerender } = renderHook(({ id }) => usePrintList(id), {
      initialProps: { id: 'u-1' as string | null },
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    rerender({ id: 'u-2' })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.entries).toEqual([])
    expect(readPrintList(localStorage, 'u-2')).toEqual([])
    expect(readPrintList(localStorage, 'u-1').map((e) => e.id)).toEqual(['c1'])
  })

  it('a refresh that resolves after a user switch does nothing', async () => {
    writePrintList(localStorage, 'u-1', [entry('c1')])
    let resolve!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)))
    const onRestored = vi.fn()
    const { result, rerender } = renderHook(
      ({ id }) => usePrintList(id, { onRestored }),
      { initialProps: { id: 'u-1' as string | null } },
    )
    rerender({ id: 'u-2' })
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => {
      resolve(json({ certificates: [apiCert('c1')], total: 1 }))
    })
    expect(result.current.entries).toEqual([])
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('a null or empty user has no list and touches no storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() => usePrintList(null))
    expect(result.current.entries).toEqual([])
    expect(result.current.ready).toBe(false)
    let ok = true
    act(() => {
      ok = result.current.toggle(apiCert('c1'))
    })
    expect(ok).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
