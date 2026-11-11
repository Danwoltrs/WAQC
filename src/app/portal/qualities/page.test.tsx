// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import PortalQualitiesPage from './page'

const replace = vi.fn()
let search = 'company=c1&period=crop-2026'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/portal/qualities',
  useSearchParams: () => new URLSearchParams(search),
}))
const portalFetch = vi.fn()
let companyId = 'c1'
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: companyId, name: 'X' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

const P1 = { key: 'crop-2026', label: 'Crop 26/27', start: 'a', end: 'b' }
const q = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Q-${id}`, origin: 'Brazil', versionNo: 3, scheduled: null, certificates: 10, approvedCertificates: 9,
  pssApprovedPct: 95, ssApprovedPct: 80, ...over,
})
const body = (qualities: unknown[], origins: unknown[] = []) => ({ period: P1, periods: [P1], origins, qualities })
const ok = (b: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) } as Response)

beforeEach(() => { search = 'company=c1&period=crop-2026'; companyId = 'c1'; replace.mockReset(); portalFetch.mockReset() })
afterEach(cleanup)

describe('Qualities page', () => {
  it('renders an origin card per origin and a table with the columns', async () => {
    portalFetch.mockImplementation(() => ok(body([q('a'), q('b', { origin: 'Colombia' })], [
      { origin: 'Brazil', qualities: 1, certificates: 10, approvedPct: 90 },
      { origin: 'Colombia', qualities: 1, certificates: 4, approvedPct: 50 },
    ])))
    render(<PortalQualitiesPage />)
    await screen.findByText('Q-a')
    expect(screen.getAllByTestId('origin-card')).toHaveLength(2)
    for (const h of ['Quality', 'Version', 'Certificates', 'PSS approved', 'SS approved']) expect(screen.getByText(h)).toBeTruthy()
  })

  it('shows the scheduled badge, dash for null version, and dash for null percentages', async () => {
    portalFetch.mockImplementation(() => ok(body([
      q('a', { versionNo: 3, scheduled: { versionNo: 4, effectiveFrom: '2027-09-01' } }),
      q('b', { versionNo: null, pssApprovedPct: null }),
    ])))
    render(<PortalQualitiesPage />)
    await screen.findByText('v4 from 1 Sep 2027')
    const row = screen.getByText('Q-b').closest('tr')!
    const cells = row.querySelectorAll('td')
    expect(cells[1].textContent).toBe('-')
    expect(cells[3].textContent).toBe('-')
    expect((cells[3] as HTMLElement).style.color).toBe('')
  })

  it('links rows keeping company and period, and colours the bands', async () => {
    portalFetch.mockImplementation(() => ok(body([q('a', { pssApprovedPct: 95, ssApprovedPct: 60 }), q('b', { pssApprovedPct: 75 })])))
    render(<PortalQualitiesPage />)
    const link = (await screen.findByText('Q-a')).closest('a')!
    const href = link.getAttribute('href')!
    expect(href.startsWith('/portal/qualities/a?')).toBe(true)
    const p = new URLSearchParams(href.split('?')[1])
    expect(p.get('company')).toBe('c1')
    expect(p.get('period')).toBe('crop-2026')
    const cellsA = screen.getByText('Q-a').closest('tr')!.querySelectorAll('td')
    expect((cellsA[3] as HTMLElement).style.color).toBe('rgb(85, 107, 47)')
    expect((cellsA[4] as HTMLElement).style.color).toBe('rgb(239, 68, 68)')
    const cellsB = screen.getByText('Q-b').closest('tr')!.querySelectorAll('td')
    expect((cellsB[3] as HTMLElement).style.color).toBe('rgb(169, 164, 84)')
  })

  it('shows the empty state', async () => {
    portalFetch.mockImplementation(() => ok(body([])))
    render(<PortalQualitiesPage />)
    await screen.findByText('No qualities are set up for this company yet.')
  })

  it('shows loading after a company switch until the new data arrives', async () => {
    portalFetch.mockImplementation(() => ok(body([q('a')])))
    const { rerender } = render(<PortalQualitiesPage />)
    await screen.findByText('Q-a')
    let resolve!: (v: Response) => void
    portalFetch.mockImplementation(() => new Promise<Response>(r => { resolve = r }))
    companyId = 'c2'
    rerender(<PortalQualitiesPage />)
    expect(screen.queryByText('Q-a')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
    resolve({ ok: true, status: 200, json: () => Promise.resolve(body([q('z')])) } as Response)
    await waitFor(() => expect(screen.getByText('Q-z')).toBeTruthy())
  })
})
