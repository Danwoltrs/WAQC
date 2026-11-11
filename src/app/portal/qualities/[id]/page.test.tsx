// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import PortalQualityDetailPage from './page'

let search = 'company=c1&period=crop-2026'
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'q1' }),
  useSearchParams: () => new URLSearchParams(search),
}))
const portalFetch = vi.fn()
let companyId = 'c1'
vi.mock('@/components/portal/portal-context', () => ({
  usePortal: () => ({ fetch: portalFetch, company: { id: companyId, name: 'X' } }),
  PortalNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

const P1 = { key: 'crop-2026', label: 'Crop 26/27', start: 'a', end: 'b' }
const nullSections = { screen: null, green: null, roast: null, defects: null, physical: null, cupping: null, taints: null, clean: null }
const detail = (over: Record<string, unknown> = {}) => ({
  period: P1,
  quality: { id: 'q1', name: 'Eurodulce 15/16', origin: 'Brazil', methodology: 'commodity' },
  inForce: { versionId: 'v3', versionNo: 3, effectiveFrom: '2026-09-01', parameters: {} },
  versions: [{ id: 'v3', versionNo: 3, effectiveFrom: '2026-09-01', status: 'in_force', changedBy: 'Wolthers', note: null, cancelNote: null }],
  sections: { ...nullSections, screen: { within: 18, lots: 20 } },
  canEdit: false,
  ...over,
})
const res = (status: number, b: unknown = {}) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(b) } as Response)

beforeEach(() => { search = 'company=c1&period=crop-2026'; companyId = 'c1'; portalFetch.mockReset() })
afterEach(cleanup)

describe('Quality detail page', () => {
  it('fetches the quality for the period and shows name, origin and the in-force badge', async () => {
    portalFetch.mockImplementation(() => res(200, detail()))
    render(<PortalQualityDetailPage />)
    await screen.findByText('Eurodulce 15/16 · Brazil')
    expect(screen.getByText('v3 in force since 1 Sep 2026')).toBeInTheDocument()
    expect(portalFetch).toHaveBeenCalledWith('/api/portal/qualities/q1?period=crop-2026')
    expect(screen.getByText('18 of 20 lots within')).toBeInTheDocument()
    expect(screen.getByTestId('spec-section-panel')).toBeDisabled()
    expect(screen.getByText('In force')).toBeInTheDocument()
  })

  it('links back to the qualities list keeping company and period', async () => {
    portalFetch.mockImplementation(() => res(200, detail()))
    render(<PortalQualityDetailPage />)
    const href = (await screen.findByRole('link', { name: /Qualities/ })).getAttribute('href')!
    expect(href.startsWith('/portal/qualities?')).toBe(true)
    const p = new URLSearchParams(href.split('?')[1])
    expect(p.get('company')).toBe('c1')
    expect(p.get('period')).toBe('crop-2026')
  })

  it('shows no badge and says so when the quality has no specification', async () => {
    portalFetch.mockImplementation(() => res(200, detail({ inForce: null, sections: null, versions: [] })))
    render(<PortalQualityDetailPage />)
    await screen.findByText('This quality has no specification yet.')
    expect(screen.queryByText(/in force since/)).toBeNull()
    expect(screen.queryByTestId('spec-section-panel')).toBeNull()
  })

  it('shows the header without origin when none is recorded', async () => {
    portalFetch.mockImplementation(() => res(200, detail({ quality: { id: 'q1', name: 'Eurodulce 15/16', origin: null, methodology: null } })))
    render(<PortalQualityDetailPage />)
    expect(await screen.findByRole('heading', { name: 'Eurodulce 15/16' })).toBeInTheDocument()
  })

  it('handles 403 and 404', async () => {
    portalFetch.mockImplementation(() => res(403))
    render(<PortalQualityDetailPage />)
    await screen.findByText('Qualities are not part of your access.')
    cleanup()
    portalFetch.mockImplementation(() => res(404))
    render(<PortalQualityDetailPage />)
    await screen.findByText('This quality was not found.')
  })

  it('shows loading after a company switch until the new data arrives', async () => {
    portalFetch.mockImplementation(() => res(200, detail()))
    const { rerender } = render(<PortalQualityDetailPage />)
    await screen.findByText('Eurodulce 15/16 · Brazil')
    let resolve!: (v: Response) => void
    portalFetch.mockImplementation(() => new Promise<Response>((r) => { resolve = r }))
    companyId = 'c2'
    rerender(<PortalQualityDetailPage />)
    expect(screen.queryByText('Eurodulce 15/16 · Brazil')).toBeNull()
    expect(screen.getByText('Loading...')).toBeTruthy()
    resolve({ ok: true, status: 200, json: () => Promise.resolve(detail({ quality: { id: 'q1', name: 'Other', origin: 'Peru', methodology: null } })) } as Response)
    await waitFor(() => expect(screen.getByText('Other · Peru')).toBeTruthy())
  })
})
