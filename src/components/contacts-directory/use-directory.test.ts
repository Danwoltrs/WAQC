import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { useDirectory } from './use-directory'

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
