import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { MAX_RELOAD_PAGES, useDirectory } from './use-directory'

const contact = { id: 'c1', name: 'Ana', email: 'ana@x.com', routing_purposes: ['sale_confirmations'] }
const page = (purposes: string[] = ['sale_confirmations']) => ({
  companies: [{ id: 'co1', name: 'Acme', fantasy_name: null, trading_roles: [], contacts: [{ ...contact, routing_purposes: purposes }] }],
  total: 1, hasMore: false, truncated: false,
})

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

const purposesOf = (r: { current: ReturnType<typeof useDirectory> }) => r.current.companies[0].contacts[0].routing_purposes

async function loaded() {
  const hook = renderHook(() => useDirectory('', 'all'))
  await waitFor(() => expect(hook.result.current.companies).toHaveLength(1))
  return hook
}

describe('useDirectory toggle', () => {
  it('sends the PATCH and shows the new state at once', async () => {
    fetchMock.mockResolvedValueOnce(json(200, page()))
    const { result } = await loaded()
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolve = r }))

    let done!: Promise<void>
    act(() => { done = result.current.toggle('co1', contact as any, 'price_report', true) })

    // Optimistic: visible before the server answered.
    expect(purposesOf(result)).toEqual(['sale_confirmations', 'price_report'])
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/companies/co1/people/c1/purposes')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ purpose: 'price_report', on: true })

    await act(async () => {
      resolve(json(200, { contact: { id: 'c1', routing_purposes: ['sale_confirmations', 'price_report'] } }))
      await done
    })
    expect(purposesOf(result)).toEqual(['sale_confirmations', 'price_report'])
  })

  it('rolls the cell back when the save fails', async () => {
    fetchMock.mockResolvedValueOnce(json(200, page()))
    const { result } = await loaded()
    fetchMock.mockResolvedValueOnce(json(500, { error: 'boom' }))

    await act(async () => { await result.current.toggle('co1', contact as any, 'price_report', true) })

    expect(purposesOf(result)).toEqual(['sale_confirmations'])
    expect(result.current.pending.size).toBe(0)
  })

  it('reloads the directory on a 409', async () => {
    fetchMock.mockResolvedValueOnce(json(200, page()))
    const { result } = await loaded()
    fetchMock.mockResolvedValueOnce(json(409, { error: 'changed elsewhere' }))
    // What the reload finds: sys added a tag meanwhile.
    fetchMock.mockResolvedValueOnce(json(200, page(['sale_confirmations', 'shipping_advice'])))

    await act(async () => { await result.current.toggle('co1', contact as any, 'price_report', true) })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/contacts/directory?')
    await waitFor(() => expect(purposesOf(result)).toEqual(['sale_confirmations', 'shipping_advice']))
  })
})

describe('useDirectory reload', () => {
  // A directory of 1,000 companies served 50 at a time, as the route does.
  const TOTAL = 1000
  const serve = () => fetchMock.mockImplementation(async (url: string) => {
    const sp = new URL(String(url), 'http://x').searchParams
    const offset = Number(sp.get('offset'))
    const limit = Number(sp.get('limit'))
    const companies = Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, i) => ({
      id: `co${offset + i}`, name: `Co ${offset + i}`, fantasy_name: null, trading_roles: [], contacts: [],
    }))
    return json(200, { companies, total: TOTAL, hasMore: offset + companies.length < TOTAL, truncated: false })
  })
  const offsetsAsked = () => fetchMock.mock.calls.map(([u]) => Number(new URL(String(u), 'http://x').searchParams.get('offset')))

  it('keeps the pages added with Load more: every loaded page is read again', async () => {
    serve()
    const { result } = renderHook(() => useDirectory('', 'all'))
    await waitFor(() => expect(result.current.companies).toHaveLength(50))
    await act(async () => { await result.current.loadMore() })
    await act(async () => { await result.current.loadMore() })
    expect(result.current.companies).toHaveLength(150)

    fetchMock.mockClear()
    await act(async () => { await result.current.reload() })
    expect(offsetsAsked().sort((a, b) => a - b)).toEqual([0, 50, 100])
    expect(result.current.companies).toHaveLength(150)
    expect(result.current.companies.at(-1)?.id).toBe('co149')
    expect(result.current.hasMore).toBe(true)

    // Load more carries on after the reloaded pages.
    fetchMock.mockClear()
    await act(async () => { await result.current.loadMore() })
    expect(offsetsAsked()).toEqual([150])
    expect(result.current.companies).toHaveLength(200)
  })

  it(`is bounded at ${MAX_RELOAD_PAGES} pages (500 companies)`, async () => {
    serve()
    const { result } = renderHook(() => useDirectory('', 'all'))
    await waitFor(() => expect(result.current.companies).toHaveLength(50))
    for (let i = 0; i < 11; i++) await act(async () => { await result.current.loadMore() })
    expect(result.current.companies).toHaveLength(600)

    fetchMock.mockClear()
    await act(async () => { await result.current.reload() })
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RELOAD_PAGES)
    expect(result.current.companies).toHaveLength(500)
    expect(result.current.hasMore).toBe(true)
  })

  it('a company that shifts across a page boundary between two reads shows once', async () => {
    fetchMock.mockResolvedValueOnce(json(200, page()))
    const { result } = await loaded()
    fetchMock.mockResolvedValueOnce(json(200, { ...page(), hasMore: true }))
    await act(async () => { await result.current.loadMore() })
    expect(result.current.companies).toHaveLength(1)
  })
})
