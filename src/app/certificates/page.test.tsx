import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * The Certificates list and its search (review with Anderson, 2026-09-28).
 *
 * Searching 42270 once returned many certificates and later far fewer. The
 * page loads its unfiltered newest-100 on mount and fires a request per
 * query, and whichever response arrived LAST was shown: a slow unfiltered
 * load (or an earlier, broader query) landed after the search and put its
 * rows under "42270". Only the newest request may land now.
 */

vi.mock('@/components/layout/main-layout', () => ({
  MainLayout: ({ children, fullWidth }: { children: React.ReactNode; fullWidth?: boolean }) => (
    <div data-testid="main-layout" data-full-width={String(!!fullWidth)}>{children}</div>
  ),
}))
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, profile: { id: 'u-1', qc_role: 'lab_personnel', is_global_admin: false } }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/certificates',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import CertificatesPage from './page'
import { Toaster } from '@/components/ui/toaster'
import { certificateListUrl } from '@/lib/certificate-list-query'
import { printListStorageKey, toPrintListEntry, type PrintListSource } from '@/lib/print-list'

const cert = (n: number, over: Record<string, unknown> = {}, sample: Record<string, unknown> = {}) => ({
  id: `cert-${n}`, certificate_number: `BR-0373${n}/26`, issued_to: 'Blaser', status: 'issued',
  created_at: '2026-09-25T10:00:00Z', pdf_url: null, sample_id: `s-${n}`, is_rejected: false,
  sample: {
    id: `s-${n}`, tracking_number: `SAN-0${n}/26`, sample_type: 'ss', origin: 'Brazil', client_id: 'blaser',
    importer_id: 'blaser', importer_is_qc_client: true, workflow_stage: 'certified',
    wolthers_contract_nr: '41000/26', buyer_contract_nr: null, seller_contract_nr: null,
    ico_number: null, container_nr: null, quality_name: null, quality_spec_id: null,
    client: { id: 'blaser', name: 'Blaser Trading AG', company: 'Blaser Trading AG', fantasy_name: 'Blaser' },
    seller: { id: 'stonex', name: 'StoneX Switzerland SA', fantasy_name: 'StoneX' },
    ...sample,
  },
  ...over,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// The print list persists per user in localStorage; every test starts empty.
beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const rows = () => screen.getAllByRole('row').slice(1)

const urls = (): string[] =>
  (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))
// The list requests only: not the filter options, not today's tin batch.
const listUrls = () =>
  urls().filter((u) => u.startsWith('/api/certificates') && !u.startsWith('/api/certificates/filter-options'))
const lastListUrl = () => listUrls().slice(-1)[0]

/** Filter options answer on their own route; every list request goes to `list`. */
const stubFetch = (list: (url: string) => Response | Promise<Response>, filterOptions?: () => Response) =>
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/certificates/filter-options')) {
      return filterOptions ? filterOptions() : json({ clients: [], qualities: [] })
    }
    if (url.startsWith('/api/certificates')) return list(url)
    return json({})
  }))

describe('CertificatesPage search', () => {
  it('never lets a slower unfiltered load overwrite the results of the query in the box', async () => {
    let releaseUnfiltered: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/certificates') return new Promise<Response>((resolve) => { releaseUnfiltered = resolve })
      if (url.startsWith('/api/certificates?search=42270')) {
        return Promise.resolve(json({ certificates: [
          cert(1, {}, { wolthers_contract_nr: '42270/26', ico_number: '002/4600/3508' }),
          cert(2, { is_rejected: true }, { wolthers_contract_nr: '42270/26', ico_number: '002/4600/3509' }),
        ], total: 2, has_more: false }))
      }
      return Promise.resolve(json({}))
    }))

    render(<CertificatesPage />)
    // The unfiltered load is in flight before the user types.
    await waitFor(() => expect((fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toContain('/api/certificates'))
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    await waitFor(() => expect(rows()).toHaveLength(2), { timeout: 2000 })

    // The unfiltered newest-100 arrives only now.
    releaseUnfiltered(json({ certificates: [cert(7), cert(8), cert(9)], total: 1267, has_more: true }))
    await new Promise((r) => setTimeout(r, 50))

    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('BR-03737/26')).not.toBeInTheDocument()
  })

  it('tells certificates of one contract apart: Wolthers contract, client refs and the decision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      certificates: [
        cert(1, {}, {
          wolthers_contract_nr: '42270/26', quality_name: 'NY 2/3 14/16 FC', buyer_contract_nr: '106761',
          seller_contract_nr: '15649', bag_count: 640, bags_quantity_mt: 38.4, bag_type: 'jute_bag',
        }),
        cert(2, { is_rejected: true }, { wolthers_contract_nr: '42270/26', quality_name: 'NY 2/3 14/16 FC' }),
      ],
      total: 2, has_more: false,
    })))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))

    const [approved, rejected] = rows()
    expect(approved).toHaveAttribute('data-decision', 'approved')
    expect(rejected).toHaveAttribute('data-decision', 'rejected')
    expect(within(approved).getByText('Approved')).toBeInTheDocument()
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument()

    // Under the certificate number: the bare Wolthers contract number only — no
    // "Wolthers" label, no quality line (rows stay two lines tall), no quantity.
    expect(within(approved).getByText('42270/26')).toBeInTheDocument()
    expect(within(approved).queryByText(/Wolthers/)).not.toBeInTheDocument()
    expect(within(approved).queryByText('NY 2/3 14/16 FC')).not.toBeInTheDocument()
    expect(within(approved).queryByText(/38\.4 MT/)).not.toBeInTheDocument()
    // Each client's own ref under its name.
    expect(within(approved).getByText('106761')).toBeInTheDocument()
    expect(within(approved).getByText('15649')).toBeInTheDocument()
  })

  it('says so when a lookup behind the search failed, instead of showing fewer as if complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('search=')
      ? json({ certificates: [cert(1)], total: 1, search_incomplete: true, has_more: false })
      : json({ certificates: [], total: 0, has_more: false }))))
    render(<CertificatesPage />)
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    expect(await screen.findByText(/search incomplete/, {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('clears the rows of another query when the search itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('search=')
      ? json({ error: 'Failed to fetch certificates' }, 500)
      : json({ certificates: [cert(7), cert(8)], total: 2, has_more: false }))))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    expect(await screen.findByText('Certificates could not be loaded. Try again.', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.queryByText('BR-03737/26')).not.toBeInTheDocument()
  })
})

/**
 * Pages of 100 (2026-10-19). The list used to load the newest 100 once and
 * filter and sort them in the browser, so anything older could not be found
 * and the count was the window, not the real total.
 */
describe('CertificatesPage pages', () => {
  it('asks the server for the next page', async () => {
    stubFetch(() => json({ certificates: [cert(1)], total: 250, has_more: true }))
    render(<CertificatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(urls()).toContain('/api/certificates?offset=100'))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByTestId('certificates-count')).toHaveTextContent('250 certificates')
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  })

  it('shows no pager while every certificate fits on one page', async () => {
    stubFetch(() => json({ certificates: [cert(1), cert(2)], total: 2, has_more: false }))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument()
  })

  it('a status chip filters on the server and goes back to page 1', async () => {
    stubFetch(() => json({ certificates: [cert(1)], total: 250, has_more: true }))
    render(<CertificatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?offset=100'))

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }))
    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?status=draft'))
    // Straight to page 1: no request for page 2 of the drafts first.
    expect(listUrls().filter((u) => u.includes('status=draft'))).toEqual(['/api/certificates?status=draft'])
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('a sort goes back to page 1 and asks the server for the order', async () => {
    stubFetch(() => json({ certificates: [cert(1)], total: 250, has_more: true }))
    render(<CertificatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?offset=100'))

    fireEvent.click(screen.getByRole('button', { name: /Origin/ }))
    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?sort_by=origin'))
  })

  it('a page that emptied after a narrower filter jumps back to the last page', async () => {
    let total = 250
    stubFetch((url) => {
      if (url.endsWith('offset=200')) {
        total = 120
        return json({ certificates: [], total, has_more: false })
      }
      return json({ certificates: [cert(1)], total, has_more: false })
    })
    render(<CertificatesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?offset=100'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(urls()).toContain('/api/certificates?offset=200'))

    await waitFor(() => expect(lastListUrl()).toBe('/api/certificates?offset=100'))
    expect(listUrls().filter((u) => u === '/api/certificates?offset=100')).toHaveLength(2)
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByText('No certificates found')).not.toBeInTheDocument()
  })

  it('takes Client and Quality from their own lookup, and a failed lookup is no error', async () => {
    stubFetch(
      () => json({ certificates: [cert(1)], total: 1, has_more: false }),
      () => json({ error: 'function certificate_list_filter_options() does not exist' }, 500),
    )
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(urls().filter((u) => u === '/api/certificates/filter-options')).toHaveLength(1)
    expect(screen.getByTestId('certificates-count')).toHaveTextContent(/^1 certificates$/)
  })

  it('sits on the page itself: no card frame around the table, full-width layout', async () => {
    stubFetch(() => json({ certificates: [cert(1)], total: 1, has_more: false }))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.getByTestId('main-layout')).toHaveAttribute('data-full-width', 'true')
    for (let el = screen.getByRole('table').parentElement; el && el !== document.body; el = el.parentElement) {
      expect(el.className.includes('rounded-lg') && el.className.includes('border')).toBe(false)
      expect(el.className).not.toContain('bg-card')
    }
    // No visible gutter: the table's wrapper cancels the page's p-6.
    expect(screen.getByRole('table').closest('.-mx-6')).not.toBeNull()
  })

  it('no longer says the list is only the newest certificates', async () => {
    stubFetch(() => json({ certificates: [cert(1)], total: 1346, has_more: true }))
    render(<CertificatesPage />)
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: 'Blaser' } })
    await waitFor(() => expect(urls().some((u) => u.startsWith('/api/certificates?search=Blaser'))).toBe(true), { timeout: 2000 })
    await waitFor(() => expect(screen.getByTestId('certificates-count')).toHaveTextContent('1,346 certificates'))
    expect(screen.queryByText(/newest/)).not.toBeInTheDocument()
  })

  it('the sample cell never shows the SAN', async () => {
    stubFetch(() => json({
      certificates: [
        cert(1, {}, { sample_type: 'type', tracking_number: 'SAN-0991/26', exporter_sample_number: null }),
        cert(2, {}, { sample_type: 'ss', tracking_number: 'SAN-0992/26', ico_number: '002/4600/3508', container_nr: 'TEMU 565.799-2' }),
        cert(3, {}, { sample_type: 'pss', tracking_number: 'SAN-0993/26', exporter_sample_number: null }),
        cert(4, {}, { sample_type: 'type', tracking_number: 'SAN-0994/26', exporter_sample_number: '144/26' }),
      ],
      total: 4, has_more: false,
    }))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(4))

    for (const row of rows()) expect(row.textContent).not.toContain('SAN-')
    // An SS keeps its container on line 2, cut with an ellipsis, never broken
    // inside the number; the whole number on hover.
    const container = screen.getByText('TEMU 565.799-2')
    expect(container).toHaveClass('truncate')
    expect(container).toHaveAttribute('title', 'TEMU 565.799-2')
    expect(within(rows()[1]).getByText('002/4600/3508')).toBeInTheDocument()
    // Any other type names the lot by its own identifier.
    expect(within(rows()[3]).getByText('144/26')).toBeInTheDocument()
  })

  it('never breaks a number inside itself: each is cut with an ellipsis and whole on hover', async () => {
    stubFetch(() => json({
      certificates: [
        cert(1, { certificate_number: 'R-SAG-011793/26' }, { sample_type: 'ss', ico_number: '002/4600/3508', container_nr: 'TEMU 565.799-2' }),
        cert(2, {}, { sample_type: 'pss', exporter_sample_number: 'S-1548/26' }),
        cert(3, {}, { sample_type: 'type', exporter_sample_number: '144/26' }),
      ],
      total: 3, has_more: false,
    }))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(3))

    // The column is sized for the longest common form, so at a normal width
    // "R-SAG-011793/26" shows whole instead of "R-SAG-" / "011793/26".
    expect(screen.getByRole('columnheader', { name: /Certificate #/ })).toHaveStyle({ width: '148px' })
    for (const value of ['R-SAG-011793/26', '002/4600/3508', 'TEMU 565.799-2', 'S-1548/26', '144/26']) {
      const el = screen.getByText(value)
      expect(el).toHaveClass('truncate')
      expect(el).toHaveAttribute('title', value)
    }
  })
})

/**
 * The print list (2026-10-19). Ticks used to live in an id set filtered
 * through the rows on screen, so a tick made before the last search silently
 * fell out of the print. Ticks now go into a per-user list that outlives
 * searches, pages and reloads, and every bulk action uses all of it.
 */
describe('CertificatesPage print list', () => {
  type Call = [unknown, RequestInit | undefined]
  const calls = (): Call[] => (fetch as unknown as { mock: { calls: Call[] } }).mock.calls
  const callTo = (url: string) => calls().find((c) => String(c[0]) === url)
  const tinCall = () => callTo('/api/samples/bulk/print-tin-sleeves')
  const param = (u: string, key: string) => new URL(u, 'http://localhost').searchParams.get(key)

  /** List requests go to `list`; the tin sheet comes back as a PDF. */
  const stubPrintFetch = (list: (url: string) => Response | Promise<Response>) =>
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/certificates/filter-options')) return json({ clients: [], qualities: [] })
      if (url.startsWith('/api/certificates')) return list(url)
      if (url === '/api/samples/bulk/print-tin-sleeves') {
        return new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
      }
      return json({})
    }))

  const renderPage = () => render(<><CertificatesPage /><Toaster /></>)
  const typeSearch = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value } })
  const rowOf = (el: HTMLElement) => el.closest('tr') as HTMLElement
  const checkboxOf = async (certNumber: string) =>
    within(rowOf(await screen.findByText(certNumber, {}, { timeout: 2000 }))).getByRole('checkbox')
  const tick = async (certNumber: string) => {
    const box = await checkboxOf(certNumber)
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.click(box)
  }
  const store = (certs: ReturnType<typeof cert>[]) =>
    localStorage.setItem(
      printListStorageKey('u-1'),
      JSON.stringify(certs.map((c) => toPrintListEntry(c as unknown as PrintListSource))),
    )
  const page = (certs: ReturnType<typeof cert>[], extra: Record<string, unknown> = {}) =>
    json({ certificates: certs, total: certs.length, has_more: false, ...extra })

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:tins')
    URL.revokeObjectURL = vi.fn()
  })

  it('keeps the first tick when a second search replaces the rows, and prints both', async () => {
    stubPrintFetch((url) => {
      const q = param(url, 'search')
      if (q === 'S-1548') return page([cert(1)])
      if (q === 'S-1547') return page([cert(2)])
      return page([])
    })
    renderPage()
    typeSearch('S-1548')
    await tick('BR-03731/26')
    typeSearch('S-1547')
    await tick('BR-03732/26')
    expect(screen.queryByText('BR-03731/26')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print · 2' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tin labels 4 cm' }))
    await waitFor(() => expect(tinCall()).toBeDefined())
    expect(JSON.parse(String(tinCall()![1]!.body))).toEqual({ sample_ids: ['s-1', 's-2'], size: '4cm' })
  })

  it('the list survives a reload', async () => {
    stubPrintFetch(() => page([cert(1)]))
    const first = renderPage()
    await tick('BR-03731/26')
    expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
    first.unmount()

    renderPage()
    const box = await checkboxOf('BR-03731/26')
    await waitFor(() => expect(box).toBeChecked())
    expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
    // Refreshed from the server by id on restore.
    expect(urls()).toContain(certificateListUrl({ ids: ['cert-1'] }))
  })

  it('says how many certificates a restore dropped', async () => {
    store([cert(1), cert(2)])
    stubPrintFetch(() => page([cert(1)]))
    renderPage()
    expect(await screen.findByText('1 certificate left the print list: no longer available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
  })

  it('refuses a tick past 300 and says why', async () => {
    const full = Array.from({ length: 300 }, (_, i) => cert(100 + i))
    store(full)
    stubPrintFetch((url) => (param(url, 'ids') ? page(full) : page([cert(1)])))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print · 300' })).toBeInTheDocument())
    const box = await checkboxOf('BR-03731/26')
    await waitFor(() => expect(box).toBeEnabled())
    fireEvent.click(box)
    expect(await screen.findByText('The print list holds at most 300 certificates.')).toBeInTheDocument()
    expect(box).not.toBeChecked()
  })

  it('the header checkbox adds and removes the rows on this page only', async () => {
    store([cert(9)])
    stubPrintFetch((url) => (param(url, 'ids') ? page([cert(9)]) : page([cert(1), cert(2)])))
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument())
    await screen.findByText('BR-03731/26')
    const header = within(screen.getAllByRole('row')[0]).getByRole('checkbox')
    await waitFor(() => expect(header).toBeEnabled())
    expect(header).not.toBeChecked()

    fireEvent.click(header)
    expect(screen.getByRole('button', { name: 'Print · 3' })).toBeInTheDocument()
    expect(header).toBeChecked()

    fireEvent.click(header)
    // The tick made elsewhere stays.
    expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
    expect(header).not.toBeChecked()
  })

  it('Download ZIP takes the whole list, not just the rows on screen', async () => {
    stubPrintFetch((url) => {
      const q = param(url, 'search')
      if (q === 'S-1548') return page([cert(1)])
      if (q === 'S-1547') return page([cert(2)])
      return page([])
    })
    renderPage()
    typeSearch('S-1548')
    await tick('BR-03731/26')
    typeSearch('S-1547')
    await tick('BR-03732/26')

    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => {}))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions (2)' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Download ZIP/ }))
    await waitFor(() => expect(callTo('/api/certificates/bulk-download')).toBeDefined())
    expect(JSON.parse(String(callTo('/api/certificates/bulk-download')![1]!.body))).toEqual({
      certificateIds: ['cert-1', 'cert-2'],
    })
  })

  it('Download ZIP says it takes at most 50', async () => {
    const many = Array.from({ length: 51 }, (_, i) => cert(100 + i))
    store(many)
    stubPrintFetch((url) => (param(url, 'ids') ? page(many) : page([cert(1)])))
    renderPage()
    const actions = await screen.findByRole('button', { name: 'Actions (51)' }, { timeout: 2000 })
    fireEvent.keyDown(actions, { key: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: /Download ZIP/ })).toHaveAttribute('data-disabled')
    expect(screen.getByText('Download at most 50 at once')).toBeInTheDocument()
    // Tin labels and bag sleeves live in the Print menu now.
    expect(screen.queryByRole('menuitem', { name: /Tin Label/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Bag Sleeves/ })).not.toBeInTheDocument()
  })

  it('a pasted column searches each number', async () => {
    stubPrintFetch(() => page([]))
    renderPage()
    const input = screen.getByPlaceholderText('Search certificates...')
    // An Excel column: CRLF line ends and a trailing blank line.
    fireEvent.paste(input, { clipboardData: { getData: () => 'S-1548\r\nS-1547\r\n' } })
    expect(input).toHaveValue('S-1548, S-1547')
    await waitFor(() => expect(
      listUrls().some((u) => u.startsWith('/api/certificates?search=') && param(u, 'search') === 'S-1548, S-1547'),
    ).toBe(true), { timeout: 2000 })
  })

  it('names the numbers that found nothing', async () => {
    stubPrintFetch((url) => page([cert(1)], param(url, 'search') ? { unmatched_terms: ['S-1549', '42001'] } : {}))
    renderPage()
    typeSearch('S-1548, S-1549, 42001')
    expect(await screen.findByText('No certificate for: S-1549, 42001', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('says when only the first 50 numbers were searched', async () => {
    stubPrintFetch((url) => page([cert(1)], param(url, 'search') ? { terms_capped: true } : {}))
    renderPage()
    typeSearch('S-1548, S-1547')
    expect(await screen.findByText('Only the first 50 numbers were searched', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('Add all puts every match in the list', async () => {
    // Two matches, one shown: Add all reaches past the rows on screen.
    stubPrintFetch((url) => (param(url, 'limit') === '300'
      ? page([cert(1), cert(2)])
      : json({ certificates: [cert(1)], total: 2, has_more: true })))
    renderPage()
    await screen.findByText('BR-03731/26')
    expect(screen.queryByRole('button', { name: /Add all/ })).not.toBeInTheDocument()

    typeSearch('Blaser')
    fireEvent.click(await screen.findByRole('button', { name: 'Add all 2 to list' }, { timeout: 2000 }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print · 2' })).toBeInTheDocument())
    const addAll = listUrls().find((u) => param(u, 'limit') === '300')!
    expect(param(addAll, 'search')).toBe('Blaser')
    expect(param(addAll, 'offset')).toBeNull()
    expect(await screen.findByText('Added 2 to the print list')).toBeInTheDocument()
  })

  it('Add all is disabled above 300 matches', async () => {
    stubPrintFetch(() => json({ certificates: [cert(1)], total: 301, has_more: true }))
    renderPage()
    typeSearch('Blaser')
    const button = await screen.findByRole('button', { name: 'Add all 301 to list' }, { timeout: 2000 })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'More than 300 matches: narrow the search')
  })

  it('a print clears the list and Restore list brings it back', async () => {
    stubPrintFetch(() => page([cert(1)]))
    // jsdom has no print(); the preview prints through the iframe's window.
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
      .mockReturnValue({ focus: vi.fn(), print: vi.fn() } as unknown as Window)
    renderPage()
    await tick('BR-03731/26')
    fireEvent.click(screen.getByRole('button', { name: 'Print · 1' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tin labels 4 cm' }))

    const print = await screen.findByRole('button', { name: 'Print' })
    await waitFor(() => expect(print).toBeEnabled())
    fireEvent.click(print)
    await waitFor(() => expect(callTo('/api/samples/tin-labels/mark-printed')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const restore = await screen.findByRole('button', { name: 'Restore list' })
    expect(screen.getByText('Print list cleared')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument() // no count: list cleared
    expect(await checkboxOf('BR-03731/26')).not.toBeChecked()

    fireEvent.click(restore)
    expect(screen.getByRole('button', { name: 'Print · 1' })).toBeInTheDocument()
    expect(await checkboxOf('BR-03731/26')).toBeChecked()
  })
})
