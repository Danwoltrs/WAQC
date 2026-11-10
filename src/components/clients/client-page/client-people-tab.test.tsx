// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@/components/portal/qc-invite-dialog', () => ({ QcInviteDialog: () => null }))
vi.mock('@/components/portal/qc-access-editor-dialog', () => ({ QcAccessEditorDialog: () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

import { ClientPeopleTab } from './client-people-tab'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const CONTACTS = [
  {
    id: 'c1', name: 'Quality team', nickname: null, email: 'quality@roastery.example', phone: null, whatsapp: null,
    preferred_language: 'en', role: 'QC', is_group: true, is_primary: false,
    routing_purposes: ['sale_confirmations', 'sample_approvals'],
  },
  {
    id: 'c2', name: 'Green Buyer', nickname: null, email: 'buyer@roastery.example', phone: null, whatsapp: null,
    preferred_language: 'en', role: 'Trading', is_group: false, is_primary: true, routing_purposes: [],
  },
]
const PORTAL = {
  members: [{
    userId: 'u1', email: 'BUYER@roastery.example', fullName: 'Green Buyer', status: 'active',
    keys: { views: ['qc_samples', 'qc_certificates', 'qc_dashboard', 'qc_containers', 'qc_reports'], capabilities: [] },
    isCompanyAdmin: false, lastSignInAt: '2026-11-06T10:00:00Z',
  }],
  invitations: [],
  activity: [],
}

function stubFetch(portalStatus = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/companies/co1/people') return new Response(JSON.stringify({ contacts: CONTACTS }))
    if (url === '/api/clients/co1/portal-access') {
      return portalStatus === 200
        ? new Response(JSON.stringify(PORTAL))
        : new Response('{}', { status: portalStatus })
    }
    if (url.endsWith('/purposes') && init?.method === 'PATCH') {
      const { purpose, on } = JSON.parse(String(init.body))
      const before = CONTACTS.find((c) => url.includes(`/${c.id}/`))!.routing_purposes
      const next = on ? [...before, purpose] : before.filter((p) => p !== purpose)
      return new Response(JSON.stringify({ contact: { id: 'x', routing_purposes: next } }))
    }
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ClientPeopleTab', () => {
  it('shows each contact once with its sys ticks and portal access on the same row', async () => {
    stubFetch()
    render(<ClientPeopleTab companyId="co1" companyName="Roastery One" />)
    const buyerRow = (await screen.findByText('Green Buyer')).closest('tr')!
    // Matched to the portal member despite the email's different case.
    expect(within(buyerRow).getByText('Viewer access')).toBeInTheDocument()
    expect(within(buyerRow).getByText(/Last signed in/)).toBeInTheDocument()
    expect(screen.getAllByRole('row').filter((r) => r.textContent?.includes('Green Buyer'))).toHaveLength(1)

    const qualityRow = screen.getByText('Quality team').closest('tr')!
    expect(within(qualityRow).getByRole('checkbox', { name: 'Quality team: Sale confirmations' })).toHaveAttribute('aria-checked', 'true')
    expect(within(qualityRow).getByText('Not for group inboxes')).toBeInTheDocument()
  })

  it('ticks a Quality column through the purposes route, one purpose at a time', async () => {
    const fetchMock = stubFetch()
    render(<ClientPeopleTab companyId="co1" companyName="Roastery One" />)
    const box = await screen.findByRole('checkbox', { name: 'Quality team: QC certificates' })
    expect(box).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box)
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'))
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/purposes'))!
    expect(call[0]).toBe('/api/companies/co1/people/c1/purposes')
    expect(JSON.parse(String(call[1]!.body))).toEqual({ purpose: 'qc_certificates', on: true })
  })

  it('leaves Trading and Logistics read-only', async () => {
    stubFetch()
    render(<ClientPeopleTab companyId="co1" companyName="Roastery One" />)
    expect(await screen.findByRole('checkbox', { name: 'Quality team: Sale confirmations' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Quality team: Shipping documents' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Quality team: EUDR / geolocation files' })).not.toBeDisabled()
  })

  it('a portal 403 keeps the contacts and shows a neutral notice', async () => {
    stubFetch(403)
    render(<ClientPeopleTab companyId="co1" companyName="Roastery One" />)
    expect(await screen.findByText('Quality team')).toBeInTheDocument()
    expect(await screen.findByText('Only global admins and quality managers manage portal access.')).toBeInTheDocument()
    expect(screen.queryByText('Invite to portal')).toBeNull()
  })
})
