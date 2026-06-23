// src/lib/portal/invite.test.ts
import { describe, it, expect } from 'vitest'
import { buildClientInvitePayload } from './invite'

describe('buildClientInvitePayload', () => {
  it('builds a client invitation row with company link and client role', () => {
    const row = buildClientInvitePayload({
      email: 'buyer@acme.com', firstName: 'Pat', lastName: 'Lee',
      companyId: 'co-1', invitedBy: 'staff-1', token: 'tok-1',
      expiresAtIso: '2026-07-01T00:00:00.000Z',
    })
    expect(row).toMatchObject({
      email: 'buyer@acme.com', first_name: 'Pat', last_name: 'Lee',
      qc_role: 'client', company_id: 'co-1', laboratory_id: null,
      qc_enabled: true, status: 'pending', invitation_token: 'tok-1',
      invited_by: 'staff-1', expires_at: '2026-07-01T00:00:00.000Z',
    })
  })
})
