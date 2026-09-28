import { describe, it, expect, vi, afterEach } from 'vitest'
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
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

afterEach(() => { vi.unstubAllGlobals() })

const rows = () => screen.getAllByRole('row').slice(1)

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
        ], has_more: false }))
      }
      return Promise.resolve(json({}))
    }))

    render(<CertificatesPage />)
    // The unfiltered load is in flight before the user types.
    await waitFor(() => expect((fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toContain('/api/certificates'))
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    await waitFor(() => expect(rows()).toHaveLength(2), { timeout: 2000 })

    // The unfiltered newest-100 arrives only now.
    releaseUnfiltered(json({ certificates: [cert(7), cert(8), cert(9)], clients: [], qualities: [], has_more: true }))
    await new Promise((r) => setTimeout(r, 50))

    expect(rows()).toHaveLength(2)
    expect(screen.queryByText('BR-03737/26')).not.toBeInTheDocument()
  })

  it('tells certificates of one contract apart: Wolthers contract, quality, client refs and the decision', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      certificates: [
        cert(1, {}, {
          wolthers_contract_nr: '42270/26', quality_name: 'NY 2/3 14/16 FC', buyer_contract_nr: '106761',
          seller_contract_nr: '15649', bag_count: 640, bags_quantity_mt: 38.4, bag_type: 'jute_bag',
        }),
        cert(2, { is_rejected: true }, { wolthers_contract_nr: '42270/26', quality_name: 'NY 2/3 14/16 FC' }),
      ],
      clients: [], qualities: [], has_more: false,
    })))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))

    const [approved, rejected] = rows()
    expect(approved).toHaveAttribute('data-decision', 'approved')
    expect(rejected).toHaveAttribute('data-decision', 'rejected')
    expect(within(approved).getByText('Approved')).toBeInTheDocument()
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument()

    // Under the certificate number: the Wolthers contract, then the quality — no quantity.
    expect(within(approved).getByText('42270/26')).toBeInTheDocument()
    expect(within(approved).getByText('NY 2/3 14/16 FC')).toBeInTheDocument()
    expect(within(approved).queryByText(/38\.4 MT/)).not.toBeInTheDocument()
    // Each client's own ref under its name.
    expect(within(approved).getByText('106761')).toBeInTheDocument()
    expect(within(approved).getByText('15649')).toBeInTheDocument()
  })

  it('says so when a lookup behind the search failed, instead of showing fewer as if complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('search=')
      ? json({ certificates: [cert(1)], search_incomplete: true, has_more: false })
      : json({ certificates: [], clients: [], qualities: [], has_more: false }))))
    render(<CertificatesPage />)
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    expect(await screen.findByText(/search incomplete/, {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('clears the rows of another query when the search itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('search=')
      ? json({ error: 'Failed to fetch certificates' }, 500)
      : json({ certificates: [cert(7), cert(8)], clients: [], qualities: [], has_more: false }))))
    render(<CertificatesPage />)
    await waitFor(() => expect(rows()).toHaveLength(2))
    fireEvent.change(screen.getByPlaceholderText('Search certificates...'), { target: { value: '42270' } })
    expect(await screen.findByText('Certificates could not be loaded. Try again.', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.queryByText('BR-03737/26')).not.toBeInTheDocument()
  })
})
