// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import PortalContainersPage from './page'

const portalFetch = vi.fn()
let companyId = 'c1'
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: companyId, name: 'X' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

const row = (nr: string, over: object = {}) => ({
  containerNr: nr, seal: 'S1', certificates: ['SAG-1/26'], contractRefs: ['K1'], quality: 'GC17', seller: 'S', vessel: 'MSC A',
  voyage: 'V1', bl: 'BL1', etd: '2026-10-03', etdActual: true, eta: '2026-11-01', etaActual: false, milestone: 'Loaded on vessel', ...over,
})
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)
const res = (status: number) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) } as Response)

beforeEach(() => { companyId = 'c1'; portalFetch.mockReset() })
afterEach(cleanup)

describe('Containers page', () => {
  it('shows planned dates muted with (planned) and actual dates plain', async () => {
    portalFetch.mockImplementationOnce(() => ok({ containers: [row('MSNU 1')] }))
    render(<PortalContainersPage />)
    await screen.findByText('MSNU 1')
    expect(screen.getByText(/01 Nov 2026 \(planned\)/)).toBeTruthy()
    expect(screen.getByText('03 Oct 2026')).toBeTruthy()
    expect(screen.getByText('MSC A / V1')).toBeTruthy()
  })

  it('shows the empty state', async () => {
    portalFetch.mockImplementationOnce(() => ok({ containers: [] }))
    render(<PortalContainersPage />)
    await screen.findByText('No containers linked to your contracts yet.')
  })

  it('drops the previous company\'s rows and shows Loading after a company switch', async () => {
    portalFetch.mockImplementationOnce(() => ok({ containers: [row('MSNU 1')] }))
    const { rerender } = render(<PortalContainersPage />)
    await screen.findByText('MSNU 1')
    companyId = 'c2'
    portalFetch.mockImplementation(() => new Promise(() => {}))
    rerender(<PortalContainersPage />)
    expect(screen.queryByText('MSNU 1')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('does not flash the denied notice for the next company, and shows an inline error on failure', async () => {
    portalFetch.mockImplementationOnce(() => res(403))
    const { rerender } = render(<PortalContainersPage />)
    await screen.findByText('Containers are not part of your access.')
    companyId = 'c2'
    portalFetch.mockImplementation(() => res(500))
    rerender(<PortalContainersPage />)
    expect(screen.queryByText('Containers are not part of your access.')).toBeNull()
    await waitFor(() => expect(screen.getByText('Could not load containers. Please refresh.')).toBeTruthy())
    expect(screen.getByLabelText('Search containers')).toBeTruthy()
  })
})
