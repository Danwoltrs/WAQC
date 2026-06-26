import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QcContactsTab } from './qc-contacts-tab'

const listResponse = {
  people: [
    { id: 'c1', company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost Pollmann', nickname: 'Joost',
      phone: null, whatsapp: null, preferred_language: 'en', is_group: false, is_primary: false,
      is_active: true, routing_purposes: ['qc_certificates'] },
  ],
  groups: [
    { id: 'g1', company_id: 'co1', email: 'qc@ahold.nl', name: 'QC inbox', nickname: null,
      phone: null, whatsapp: null, preferred_language: null, is_group: true, is_primary: false,
      is_active: true, routing_purposes: ['qc_certificates'] },
  ],
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/qc-contacts') && (!init || !init.method || init.method === 'GET')) {
      return { ok: true, json: async () => listResponse } as Response
    }
    if (u.endsWith('/qc-contacts') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ contact: { id: 'c2' } }) } as Response
    }
    return { ok: false, json: async () => ({ error: 'unexpected' }) } as Response
  }))
})

describe('QcContactsTab', () => {
  it('lists the company QC-certificate recipients (people + group inboxes)', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    expect(screen.getByText('qc@ahold.nl')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Group inboxes')).toBeInTheDocument()
  })

  it('adds a recipient via POST', async () => {
    render(<QcContactsTab companyId="co1" companyName="Ahold" />)
    await waitFor(() => expect(screen.getByText('Joost Pollmann')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'new@ahold.nl' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      expect(calls.some((c) => String(c[0]).endsWith('/qc-contacts') && (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(true)
    })
  })
})
