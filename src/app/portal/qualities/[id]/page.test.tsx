// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react'
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

  it('shows the original specification as v1 without the 2000 date', async () => {
    portalFetch.mockImplementation(() => res(200, detail({
      inForce: { versionId: 'v1', versionNo: 1, effectiveFrom: '2000-01-01', parameters: {}, original: true },
      versions: [{ id: 'v1', versionNo: 1, effectiveFrom: '2000-01-01', status: 'in_force', changedBy: 'Wolthers', note: null, cancelNote: null, original: true }],
    })))
    render(<PortalQualityDetailPage />)
    await screen.findByText('Eurodulce 15/16 · Brazil')
    expect(screen.getByText('v1 · Original specification')).toBeInTheDocument()
    expect(screen.queryByText(/in force since/)).toBeNull()
    expect(screen.queryByText(/2000/)).toBeNull()
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

describe('Quality detail page: changing the spec', () => {
  const v3 = { id: 'v3', versionNo: 3, effectiveFrom: '2026-09-01', status: 'in_force', changedBy: 'Wolthers', note: null, cancelNote: null }
  const v4 = { id: 'v4', versionNo: 4, effectiveFrom: '2026-11-18', status: 'scheduled', changedBy: 'Ana', note: null, cancelNote: null }
  const params = {
    max_quakers: 5,
    // No ids on purpose: the editor's cupping section would add them on mount.
    cupping_attributes: [{ attribute: 'Body', scale: { type: 'numeric', min: 1, max: 10, increment: 0.25 }, is_required: true }],
  }
  const editable = (over: Record<string, unknown> = {}) =>
    detail({ canEdit: true, inForce: { versionId: 'v3', versionNo: 3, effectiveFrom: '2026-09-01', parameters: params }, versions: [v3], ...over })
  const gets = () => portalFetch.mock.calls.filter((c) => !c[1]).length
  const nav = () => screen.getByRole('navigation', { name: 'Sections' })
  const go = (title: string) => fireEvent.click(within(nav()).getByText(title))

  it('offers Change only to a client who can edit', async () => {
    portalFetch.mockImplementation(() => res(200, detail()))
    render(<PortalQualityDetailPage />)
    await screen.findByText('Eurodulce 15/16 · Brazil')
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    cleanup()
    portalFetch.mockImplementation(() => res(200, editable()))
    render(<PortalQualityDetailPage />)
    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('replaces Change with the scheduled line while a change is scheduled', async () => {
    portalFetch.mockImplementation(() => res(200, editable({ versions: [v4, v3] })))
    render(<PortalQualityDetailPage />)
    expect(await screen.findByText('A change is scheduled for 18 Nov 2026. Cancel it to make another.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
  })

  it('edits a working copy across sections, and Cancel throws it away', async () => {
    portalFetch.mockImplementation(() => res(200, editable()))
    render(<PortalQualityDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(screen.getByTestId('spec-section-panel')).not.toBeDisabled()
    go('Moisture, density & quakers')
    fireEvent.change(screen.getByLabelText('Max quakers'), { target: { value: '3' } })
    go('Screen sizes')
    go('Moisture, density & quakers')
    expect(screen.getByLabelText('Max quakers')).toHaveValue(3)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('spec-section-panel')).toBeDisabled()
    expect(screen.getByLabelText('Max quakers')).toHaveValue(5)
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('counts no editor-added cupping ids as changes', async () => {
    portalFetch.mockImplementation(() => res(200, editable()))
    render(<PortalQualityDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    go('Cupping attributes')
    expect(screen.getByDisplayValue('Body')).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    expect(await screen.findByText('No changes yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled()
  })

  it('saves the working copy, refetches and leaves editing on 201', async () => {
    portalFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? res(201, { versionId: 'v4', versionNo: 4, effectiveFrom: '2026-11-11', notified: 2 }) : res(200, editable()))
    render(<PortalQualityDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    go('Moisture, density & quakers')
    fireEvent.change(screen.getByLabelText('Max quakers'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    expect(await screen.findByText('Moisture, density & quakers: max_quakers 5 → 3')).toBeInTheDocument()
    expect(gets()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }))
    await waitFor(() => expect(gets()).toBe(2))
    const post = portalFetch.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(post[0]).toBe('/api/portal/qualities/q1/versions')
    const body = JSON.parse(post[1].body)
    expect(body).toMatchObject({ baseVersionId: 'v3', effectiveFrom: 'now', note: null })
    expect(body.parameters.max_quakers).toBe(3)
    expect(body.parameters.cupping_attributes[0]).toMatchObject({ attribute: 'Body' })
    expect(portalFetch.mock.calls[portalFetch.mock.calls.length - 1][0]).toBe('/api/portal/qualities/q1?period=crop-2026')
    await waitFor(() => expect(screen.queryByText('Moisture, density & quakers: max_quakers 5 → 3')).toBeNull())
    expect(screen.getByTestId('spec-section-panel')).toBeDisabled()
  })

  it('keeps the working copy and shows the server text on 409', async () => {
    portalFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? res(409, { error: 'This quality changed since you opened it.' }) : res(200, editable()))
    render(<PortalQualityDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    go('Moisture, density & quakers')
    fireEvent.change(screen.getByLabelText('Max quakers'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save change' }))
    expect(await screen.findByText('This quality changed since you opened it.')).toBeInTheDocument()
    expect(gets()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }))
    await waitFor(() => expect(screen.queryByText('This quality changed since you opened it.')).toBeNull())
    expect(screen.getByTestId('spec-section-panel')).not.toBeDisabled()
    expect(screen.getByLabelText('Max quakers')).toHaveValue(3)
  })

  it('cancels a scheduled change after confirming, then refetches', async () => {
    portalFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? res(200, { ok: true }) : res(200, editable({ versions: [v4, v3] })))
    render(<PortalQualityDetailPage />)
    await screen.findByText('A change is scheduled for 18 Nov 2026. Cancel it to make another.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Cancel the change scheduled for 18 Nov 2026?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the change' }))
    await waitFor(() => expect(gets()).toBe(2))
    const del = portalFetch.mock.calls.find((c) => c[1]?.method === 'DELETE')!
    expect(del[0]).toBe('/api/portal/qualities/q1/versions/v4')
    await waitFor(() => expect(screen.queryByText('Cancel the change scheduled for 18 Nov 2026?')).toBeNull())
  })

  it('shows the server text when a scheduled change can no longer be cancelled', async () => {
    portalFetch.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? res(409, { error: 'This change has already started.' }) : res(200, editable({ versions: [v4, v3] })))
    render(<PortalQualityDetailPage />)
    await screen.findByText('A change is scheduled for 18 Nov 2026. Cancel it to make another.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel the change' }))
    expect(await screen.findByText('This change has already started.')).toBeInTheDocument()
    expect(gets()).toBe(1)
  })
})
