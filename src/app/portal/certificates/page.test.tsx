// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import PortalCertificatesPage from './page'

const replace = vi.fn()
let search = 'company=c1'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/portal/certificates',
  useSearchParams: () => new URLSearchParams(search),
}))

const portalFetch = vi.fn()
let companyId = 'c1'
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: companyId, name: 'X' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

const P1 = { key: 'crop-2026', label: 'Crop 26/27', start: 'a', end: 'b' }
const P2 = { key: 'crop-2025', label: 'Crop 25/26', start: 'a', end: 'b' }
const row = (n: string) => ({
  id: n, certificateNumber: n, contract: 'K1', origin: 'Brazil', quality: 'GC17', seller: 'S', type: 'PSS',
  crop: '26/27', status: 'approved', issuedDate: '2026-10-01T00:00:00Z', downloadUrl: '/d',
})
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)
const res = (status: number) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) } as Response)

beforeEach(() => {
  search = 'company=c1'
  companyId = 'c1'
  replace.mockReset()
  portalFetch.mockReset()
})
afterEach(cleanup)

describe('Certificates page stale-data rules', () => {
  it('drops the previous company\'s rows and shows Loading after a company switch; no denied flash', async () => {
    portalFetch.mockImplementationOnce(() => ok({ period: P1, periods: [P1, P2], certificates: [row('SAG-C1')] }))
    const { rerender } = render(<PortalCertificatesPage />)
    await screen.findByText('SAG-C1')
    companyId = 'c2'
    portalFetch.mockImplementation(() => new Promise(() => {}))
    rerender(<PortalCertificatesPage />)
    expect(screen.queryByText('SAG-C1')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('does not flash the no-access notice for the next company after a 403', async () => {
    portalFetch.mockImplementationOnce(() => res(403))
    const { rerender } = render(<PortalCertificatesPage />)
    await screen.findByText('Certificates are not part of your access.')
    companyId = 'c2'
    portalFetch.mockImplementation(() => new Promise(() => {}))
    rerender(<PortalCertificatesPage />)
    expect(screen.queryByText('Certificates are not part of your access.')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('keeps the header usable and shows the error inline when a period change fails', async () => {
    portalFetch.mockImplementationOnce(() => ok({ period: P1, periods: [P1, P2], certificates: [row('SAG-C1')] }))
    const { rerender } = render(<PortalCertificatesPage />)
    await screen.findByText('SAG-C1')
    portalFetch.mockImplementation(() => res(500))
    search = 'company=c1&period=crop-2025'
    rerender(<PortalCertificatesPage />)
    await waitFor(() => expect(screen.getByText('Could not load certificates. Please refresh.')).toBeTruthy())
    expect(screen.queryByText('SAG-C1')).toBeNull()
    expect(screen.getByLabelText('Period')).toBeTruthy()
    expect(screen.getByLabelText('Search certificates')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search certificates'), { target: { value: 'x' } })
  })
})
