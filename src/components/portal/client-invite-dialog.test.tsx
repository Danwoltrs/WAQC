import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClientInviteDialog } from './client-invite-dialog'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/api/portal/invitations') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ success: true, invitationUrl: 'http://x/accept' }) } as Response
    }
    return { ok: true, json: async () => ({ invitations: [] }) } as Response
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('ClientInviteDialog', () => {
  it('opens and posts an invitation', async () => {
    render(<ClientInviteDialog companyId="co-1" companyName="Acme" />)
    fireEvent.click(screen.getByRole('button', { name: /invite portal user/i }))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Pat' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Lee' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@acme.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/portal/invitations', expect.objectContaining({ method: 'POST' }))
    })
  })
})
