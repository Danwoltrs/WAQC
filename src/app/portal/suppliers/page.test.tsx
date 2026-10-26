// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import PortalSuppliersPage from './page'

const replace = vi.fn()
let search = 'company=c1'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/portal/suppliers',
  useSearchParams: () => new URLSearchParams(search),
}))
const portalFetch = vi.fn()
let companyId = 'c1'
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: companyId, name: 'X' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))
vi.mock('@/components/portal/suppliers/seller-detail', () => ({
  SellerDetailPanel: ({ detail }: any) => <div>detail:{detail.seller}</div>,
}))

const P1 = { key: 'crop-2026', label: 'Crop 26/27', start: 'a', end: 'b' }
const P2 = { key: 'crop-2025', label: 'Crop 25/26', start: 'a', end: 'b' }
const srow = (seller: string) => ({ seller, certificates: 20, rejected: 4, approvalRate: 80, pssRate: 75, ssRate: 90, ssMt: 12.5, fewLots: false })
const body = (sellers: string[], detail: unknown = null) => ({ period: P1, periods: [P1, P2], sellers: sellers.map(srow), detail })
const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response)
const res = (status: number) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) } as Response)

beforeEach(() => { search = 'company=c1'; companyId = 'c1'; replace.mockReset(); portalFetch.mockReset() })
afterEach(cleanup)

describe('Suppliers page', () => {
  it('shows the seller table and selecting a seller sets ?seller= keeping company, period and filters', async () => {
    search = 'company=c1&period=crop-2025&origin=Brazil'
    portalFetch.mockImplementation(() => ok(body(['Cooxupé'])))
    render(<PortalSuppliersPage />)
    fireEvent.click(await screen.findByText('Cooxupé'))
    const url = replace.mock.calls[0][0] as string
    const p = new URLSearchParams(url.split('?')[1])
    expect(p.get('seller')).toBe('Cooxupé')
    expect(p.get('company')).toBe('c1')
    expect(p.get('period')).toBe('crop-2025')
    expect(p.get('origin')).toBe('Brazil')
  })

  it('renders the detail for the selected seller', async () => {
    search = 'company=c1&seller=Cooxup%C3%A9'
    portalFetch.mockImplementation(() => ok(body(['Cooxupé'], { seller: 'Cooxupé' })))
    render(<PortalSuppliersPage />)
    await screen.findByText('detail:Cooxupé')
  })

  it('does not show the seller selection as a filter tag', async () => {
    search = 'company=c1&seller=Cooxup%C3%A9&origin=Brazil'
    portalFetch.mockImplementation(() => ok(body(['Cooxupé'], { seller: 'Cooxupé' })))
    render(<PortalSuppliersPage />)
    await screen.findByText('detail:Cooxupé')
    expect(screen.getByText(/Brazil/)).toBeTruthy()
    expect(screen.queryByTitle('Remove filter', { exact: true })).not.toBeNull()
    expect(screen.getAllByTitle('Remove filter')).toHaveLength(1)
  })

  it('drops the previous company\'s rows and shows Loading after a company switch', async () => {
    portalFetch.mockImplementationOnce(() => ok(body(['Cooxupé'])))
    const { rerender } = render(<PortalSuppliersPage />)
    await screen.findByText('Cooxupé')
    companyId = 'c2'
    portalFetch.mockImplementation(() => new Promise(() => {}))
    rerender(<PortalSuppliersPage />)
    expect(screen.queryByText('Cooxupé')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('keeps the header and shows an inline error when a period change fails', async () => {
    portalFetch.mockImplementationOnce(() => ok(body(['Cooxupé'])))
    const { rerender } = render(<PortalSuppliersPage />)
    await screen.findByText('Cooxupé')
    portalFetch.mockImplementation(() => res(500))
    search = 'company=c1&period=crop-2025'
    rerender(<PortalSuppliersPage />)
    await waitFor(() => expect(screen.getByText('Could not load suppliers. Please refresh.')).toBeTruthy())
    expect(screen.queryByText('Cooxupé')).toBeNull()
    expect(screen.getByLabelText('Period')).toBeTruthy()
  })

  it('shows the no-access notice on 403 and the empty text without sellers', async () => {
    portalFetch.mockImplementationOnce(() => res(403))
    const { unmount } = render(<PortalSuppliersPage />)
    await screen.findByText('Suppliers are not part of your access.')
    unmount()
    portalFetch.mockImplementation(() => ok(body([])))
    render(<PortalSuppliersPage />)
    await screen.findByText('No certificates in Crop 26/27')
  })
})
