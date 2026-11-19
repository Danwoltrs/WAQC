import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StandbyLink, StandbyView } from './standby-view'

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const row = (over: Record<string, unknown> = {}) => ({
  id: 'c1', sampleId: 's1', certificateNumber: '000123-COL/26', standbyAt: '2026-11-10T12:00:00Z', daysWaiting: 9,
  ico: '003/1234/0056', shipper: 'Carcafe', client: "Dunkin'", quality: 'Excelso EP', origin: 'Colombia', contract: '42250/26', sampleType: 'pss',
  ...over,
})

function serve(list: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; method: string; body?: any }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (init?.method === 'POST') return { ok: true, json: async () => ({ success: true }) } as Response
    return {
      ok: true,
      json: async () => ({ certificates: [row()], total: 1, available: true, enabled: true, lab_view: { laboratory_id: 'lab', read_only: false }, ...list }),
    } as Response
  }))
  return calls
}

describe('StandbyView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists who is waiting, with the number already assigned and the days waited', async () => {
    serve()
    render(<StandbyView />)
    expect(await screen.findByText('000123-COL/26')).toBeInTheDocument()
    // The page title and the yellow badge on the row.
    expect(screen.getAllByText('Standby')).toHaveLength(2)
    expect(screen.getByText('003/1234/0056')).toBeInTheDocument()
    expect(screen.getByText('Carcafe')).toBeInTheDocument()
    expect(screen.getByText('9 days')).toBeInTheDocument()
  })

  it('searches by ICO, shipper or certificate number', async () => {
    const calls = serve()
    const user = userEvent.setup()
    render(<StandbyView />)
    await screen.findByText('000123-COL/26')
    await user.type(screen.getByRole('textbox', { name: 'Search by ICO number, shipper or certificate number' }), 'carcafe')
    await waitFor(() => expect(calls.some((c) => c.url === '/api/certificates/standby?search=carcafe')).toBe(true))
  })

  it('finalizes by adding the container, then takes the row off the list', async () => {
    const calls = serve()
    const user = userEvent.setup()
    render(<StandbyView />)
    await user.click(await screen.findByRole('button', { name: 'Add container' }))
    const finalize = screen.getByRole('button', { name: 'Finalize certificate' })
    expect(finalize).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Container number' }), 'msku1234567')
    await user.click(finalize)
    await waitFor(() => expect(calls).toContainEqual({ url: '/api/certificates/c1/finalize', method: 'POST', body: { container_nr: 'MSKU1234567' } }))
    await waitFor(() => expect(screen.queryByText('000123-COL/26')).toBeNull())
  })

  it('offers no way to finalize when HQ is only looking at another laboratory', async () => {
    serve({ lab_view: { laboratory_id: 'other', read_only: true } })
    render(<StandbyView />)
    await screen.findByText('000123-COL/26')
    expect(screen.queryByRole('button', { name: 'Add container' })).toBeNull()
  })
})

describe('StandbyLink', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows where pre-certificates are in use, with how many wait', async () => {
    serve({ total: 3 })
    render(<StandbyLink />)
    const link = await screen.findByRole('link', { name: /Standby/ })
    expect(link).toHaveAttribute('href', '/certificates/standby')
    expect(link).toHaveTextContent('3')
  })

  it('is not shown in a laboratory that does not use them (Brazil)', async () => {
    serve({ certificates: [], total: 0, enabled: false })
    const { container } = render(<StandbyLink />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
