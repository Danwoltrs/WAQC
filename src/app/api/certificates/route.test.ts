import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => {
  // SAK-011877/26, as the list query returns it: an Ahold SS lot with no
  // Wolthers contract. The table shows Ahold and LDC Suisse from these columns.
  const certRow = {
    id: 'cert-877',
    certificate_number: 'SAK-011877/26',
    issued_to: null,
    status: 'issued',
    created_at: '2026-09-14T15:00:00+00:00',
    pdf_url: null,
    sample_id: 'san-921',
    is_rejected: false,
    sample: {
      id: 'san-921',
      tracking_number: 'SAN-00921/26',
      lab_source_sample_id: null,
      contract_id: null,
      wolthers_contract_nr: null,
      seller_contract_nr: null,
      buyer_contract_nr: 'IR0007621-1',
      client_id: 'ahold',
      importer_id: 'ahold',
      seller_id: 'ldc-suisse',
      exporter_id: 'dreyfus',
      roaster_id: null,
      client: { id: 'ahold', name: 'Ahold Delhaize Coffee Company B.V.', company: 'Ahold Delhaize Coffee Company B.V.', fantasy_name: 'Ahold' },
      seller: { id: 'ldc-suisse', name: 'Louis Dreyfus Company Suisse S.A.', fantasy_name: 'LDC Suisse' },
      quality_spec: null,
    },
  }
  const emailMessages = [
    {
      status: 'sent',
      sent_by: 'user-anderson',
      sent_at: '2026-09-14T18:30:00Z',
      metadata: { source: 'batch_approval', sample_id: 'san-921', side: 'buyer' },
    },
  ]
  const userDb = () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.order = () => q
    q.range = () => q
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: [certRow], error: null }).then(resolve, reject)
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-anderson' } }, error: null }) },
      from: () => q,
    }
  }
  const adminDb = () => ({
    from(table: string) {
      const eq: Array<[string, unknown]> = []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (column: string, value: unknown) => {
        eq.push([column, value])
        return q
      }
      q.in = (column: string, ids: string[]) => {
        if (table === 'profiles') {
          return Promise.resolve({ data: [{ id: 'user-anderson', full_name: 'Anderson Nunes' }], error: null })
        }
        if (table === 'email_messages' && column === 'metadata->>sample_id') {
          const data = emailMessages.filter(
            (m) =>
              ids.includes(m.metadata.sample_id) &&
              eq.every(([c, v]) => (m as unknown as Record<string, unknown>)[c] === v),
          )
          return Promise.resolve({ data, error: null })
        }
        return Promise.resolve({ data: [], error: null })
      }
      return q
    },
  })
  return { userDb, adminDb }
})

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => h.userDb() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.adminDb() }))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => false }))
vi.mock('@/lib/tolerance/fetch', () => ({ fetchIssuedValues: async () => null }))

import { GET } from './route'

describe('GET /api/certificates — a certificate with no sys contract', () => {
  it('names its QC client and seller for the bulk send buttons, and shows the send it already had', async () => {
    const res = await GET({ nextUrl: new URL('http://localhost/api/certificates') } as never)
    expect(res.status).toBe(200)
    const cert = (await res.json()).certificates[0]
    expect(cert.buyer_id).toBe('ahold')
    expect(cert.seller_id).toBe('ldc-suisse')
    expect(cert.send_status).toEqual({
      buyerSent: { initials: 'AN', name: 'Anderson Nunes', at: '2026-09-14T18:30:00Z' },
      sellerSent: null,
      full: false,
    })
  })
})
