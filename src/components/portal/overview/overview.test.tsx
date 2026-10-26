// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import PortalOverviewPage from '@/app/portal/page'
import { DUNKIN, MT_PER_SS } from '@/lib/portal/overview-model.fixtures'
import type { LatestCert } from '@/lib/portal/overview-model'

const replace = vi.fn()
let search = 'company=c1'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/portal',
  useSearchParams: () => new URLSearchParams(search),
}))

const portalFetch = vi.fn()
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: 'c1', name: 'Dunkin' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

const P_CURRENT = { key: 'crop-2026', label: 'Crop 26/27', start: 'a', end: 'b' }
const P_PREV = { key: 'crop-2025', label: 'Crop 25/26', start: 'a', end: 'b' }
const cert = (i: number, over: Partial<LatestCert> = {}): LatestCert => ({
  id: `id${i}`, certificateNumber: `SAG-0118${i}/26`, contractRef: `R${i}`, type: 'ss', origin: 'Brazil',
  lab: 'Santos lab', seller: 'OFI', importer: 'OFI', roaster: 'Qusac', issuedAt: '2026-10-22T15:00:00Z',
  rejected: false, ...over,
})
const LATEST = [
  ...Array.from({ length: 7 }, (_, i) => cert(i)),
  cert(9, { certificateNumber: null, contractRef: 'REF-77', seller: 'Cooxupé', type: 'pss' }),
]
const respond = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
const payload = (paths = DUNKIN, period = P_CURRENT) =>
  ({ period, periods: [P_CURRENT, P_PREV], paths, latest: LATEST })

beforeEach(() => {
  search = 'company=c1'
  replace.mockClear()
  portalFetch.mockReset()
  portalFetch.mockImplementation(() => respond(payload()))
})
afterEach(cleanup)

const kpiOf = (label: string) =>
  screen.getAllByText(label, { selector: 'small' })[0].parentElement!
const loaded = async () => { await screen.findByRole('heading', { name: 'Overview' }) }

describe('Overview page', () => {
  it('puts the scope tags in the heading row', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    const row = screen.getByRole('heading', { name: 'Overview' }).parentElement!
    for (const t of ['Brazil', 'Santos lab', '1 quality']) expect(within(row).getByText(t)).toBeTruthy()
  })

  it('has the metric toggle with Certificates pressed', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    expect(screen.getByRole('button', { name: 'Certificates' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Quantity (MT)' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reads the five KPIs, red where it should be', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    const kpi = (label: string) => kpiOf(label)
    expect(kpi('Certificates').textContent).toContain('564')
    expect(kpi('Approved (81%)').textContent).toContain('459')
    expect(kpi('Rejected').querySelector('b')!.className).toContain('text-[#ef4444]')
    expect(kpi('PSS approved').querySelector('b')!.textContent).toBe('70%')
    expect(kpi('PSS approved').querySelector('b')!.className).toContain('text-[#ef4444]')
    expect(kpi('SS approved').querySelector('b')!.textContent).toBe('86%')
    expect(kpi('SS approved').querySelector('b')!.className).not.toContain('text-[#ef4444]')
  })

  it('switches the first KPI to MT on SS with one decimal', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Quantity (MT)' }))
    const label = screen.getByText('MT on SS')
    expect(label.parentElement!.textContent).toContain((401 * MT_PER_SS).toFixed(1))
    expect(screen.getByText(/sized by MT on SS/)).toBeTruthy()
  })

  it('lists the periods and refetches with period=<key>', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    const select = screen.getByLabelText('Period') as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toEqual(['Crop 26/27', 'Crop 25/26'])
    fireEvent.change(select, { target: { value: 'crop-2025' } })
    await waitFor(() => expect(portalFetch).toHaveBeenLastCalledWith('/api/portal/overview?period=crop-2025'))
    expect(replace.mock.calls.at(-1)![0]).toContain('period=crop-2025')
  })

  it('starts from the period in the URL', async () => {
    search = 'company=c1&period=crop-2025'
    render(<PortalOverviewPage />)
    await loaded()
    expect(portalFetch).toHaveBeenCalledWith('/api/portal/overview?period=crop-2025')
  })

  it('shows the empty state and dashes when there are no paths', async () => {
    portalFetch.mockImplementation(() => respond({ ...payload([]), latest: [] }))
    render(<PortalOverviewPage />)
    await loaded()
    expect(screen.getByText('No certificates in Crop 26/27')).toBeTruthy()
    expect(kpiOf('PSS approved').querySelector('b')!.textContent).toBe('—')
    expect(kpiOf('SS approved').querySelector('b')!.textContent).toBe('—')
    expect(screen.getByText('Approved (—)')).toBeTruthy()
    expect(document.body.textContent).not.toContain('NaN')
  })

  it('shows an error line when the fetch fails', async () => {
    portalFetch.mockImplementation(() => respond({}, false))
    render(<PortalOverviewPage />)
    expect(await screen.findByText(/Could not load the overview/)).toBeTruthy()
  })

  it('shows at most 6 latest certificates, with the contract ref when there is no number', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    const card = screen.getByRole('heading', { name: 'Latest certificates' }).closest('section')!
    expect(within(card).getAllByRole('row').length).toBe(1 + 6)
    expect(within(card).getAllByText('22 Oct').length).toBe(6)
    expect(within(card).queryByText('REF-77')).toBeNull()
  })

  it('filters the latest list like the paths and shows the contract ref', async () => {
    search = 'company=c1&seller=Cooxup%C3%A9'
    render(<PortalOverviewPage />)
    await loaded()
    const card = screen.getByRole('heading', { name: 'Latest certificates' }).closest('section')!
    expect(within(card).getByText('REF-77')).toBeTruthy()
    expect(within(card).getAllByRole('row').length).toBe(2)
  })

  it('clicking a tag removes the filter, Clear appears with a filter', async () => {
    search = 'company=c1&seller=Cooxup%C3%A9'
    render(<PortalOverviewPage />)
    await loaded()
    fireEvent.click(screen.getByText('Clear'))
    expect(replace.mock.calls.at(-1)![0]).not.toContain('seller')
  })

  it('lists qualities', async () => {
    render(<PortalOverviewPage />)
    await loaded()
    const card = screen.getByRole('heading', { name: 'Qualities' }).closest('section')!
    expect(within(card).getByText('Dunkin')).toBeTruthy()
    expect(within(card).queryByText('All qualities')).toBeNull()
  })
})
