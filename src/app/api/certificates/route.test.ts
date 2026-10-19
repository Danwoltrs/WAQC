import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  // Every builder call on the certificates queries, in order: [method, ...args].
  const calls: unknown[][] = []
  // What the list query (and a count-only `head` query) resolve to; reset per test.
  const listPage = () => ({ data: [certRow] as unknown, error: null as unknown, count: 1346 as number | null })
  const results = { list: listPage(), head: { data: null, error: null as unknown, count: 1346 as number | null } }
  const userDb = () => {
    const builder = () => {
      const q: Record<string, unknown> = {}
      let head = false
      for (const m of ['select', 'eq', 'neq', 'is', 'not', 'or', 'in', 'gte', 'lt', 'order', 'range']) {
        q[m] = (...args: unknown[]) => {
          calls.push([m, ...args])
          if (m === 'select') head = (args[1] as { head?: boolean } | undefined)?.head === true
          return q
        }
      }
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(head ? results.head : results.list).then(resolve, reject)
      return q
    }
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'user-anderson' } }, error: null }) },
      from: () => builder(),
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
  const noSearch = { or: null, truncated: false, failed: false, unmatchedTerms: [], termsCapped: false }
  const resolveSearch = vi.fn()
  return { userDb, adminDb, calls, results, listPage, noSearch, resolveSearch }
})

vi.mock('@/lib/supabase-server', () => ({ createClient: async () => h.userDb() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.adminDb() }))
vi.mock('@/lib/auth/sample-access', () => ({ isStaffSampleManager: async () => false }))
vi.mock('@/lib/tolerance/fetch', () => ({ fetchIssuedValues: async () => null }))
vi.mock('@/lib/search/cert-search-multi', () => ({ resolveCertificateSearch: h.resolveSearch }))

import { GET } from './route'

const calls = h.calls

beforeEach(() => {
  calls.length = 0
  h.results.list = h.listPage()
  h.results.head = { data: null, error: null, count: 1346 }
  h.resolveSearch.mockReset()
  h.resolveSearch.mockResolvedValue(h.noSearch)
})

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

describe('GET /api/certificates — the list query', () => {
  it('pages and filters in the query and returns the exact total', async () => {
    const res = await GET({ nextUrl: new URL('http://localhost/api/certificates?client_id=ahold&sort_by=origin&sort_order=asc&offset=100') } as never)
    const body = await res.json()
    expect(calls).toEqual(expect.arrayContaining([
      ['select', expect.any(String), { count: 'exact' }],
      ['eq', 'sample.client_id', 'ahold'], ['order', 'sample(origin)', { ascending: true, nullsFirst: false }], ['range', 100, 199],
    ]))
    expect(body.total).toBe(1346)
    expect(body.has_more).toBe(true)
    expect(body).not.toHaveProperty('clients')
    expect(body).not.toHaveProperty('qualities')
  })

  it('ids mode returns just those certificates', async () => {
    const body = await (await GET({ nextUrl: new URL('http://localhost/api/certificates?ids=cert-877&search=S-1548') } as never)).json()
    expect(calls).toContainEqual(['in', 'id', ['cert-877']])
    expect(calls.some(([m]) => m === 'range')).toBe(false)
    // The list is the ids, not a search: nothing is resolved, the total is what came back.
    expect(h.resolveSearch).not.toHaveBeenCalled()
    expect(body.total).toBe(1)
    expect(body.has_more).toBe(false)
  })

  it('a list search reports the numbers with no certificate', async () => {
    h.resolveSearch.mockResolvedValue({ or: 'sample_id.in.(san-921)', unmatchedTerms: ['S-1549'], termsCapped: false, truncated: false, failed: false })
    const body = await (await GET({ nextUrl: new URL('http://localhost/api/certificates?search=S-1548,S-1549') } as never)).json()
    expect(h.resolveSearch).toHaveBeenCalledWith(expect.anything(), 'S-1548,S-1549')
    expect(calls).toContainEqual(['or', 'sample_id.in.(san-921)'])
    expect(body.unmatched_terms).toEqual(['S-1549'])
    expect(body.terms_capped).toBe(false)
  })

  it('flags a search that was cut or resolved incompletely', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.resolveSearch.mockResolvedValue({ or: 'sample_id.in.(san-921)', unmatchedTerms: [], termsCapped: true, truncated: true, failed: true })
    const body = await (await GET({ nextUrl: new URL('http://localhost/api/certificates?search=Ahold') } as never)).json()
    expect(body.search_truncated).toBe(true)
    expect(body.search_incomplete).toBe(true)
    expect(body.terms_capped).toBe(true)
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('ids mode still drops a certificate whose sample was deleted', async () => {
    await GET({ nextUrl: new URL('http://localhost/api/certificates?ids=cert-877,cert-878') } as never)
    expect(calls).toEqual(expect.arrayContaining([
      ['is', 'sample.deleted_at', null], ['in', 'id', ['cert-877', 'cert-878']], ['or', 'sample.not.is.null,sample_id.is.null'],
    ]))
  })

  it('a page past the end returns no rows and the real total, not an error', async () => {
    h.results.list = { data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' }, count: null }
    h.results.head = { data: null, error: null, count: 37 }
    const res = await GET({ nextUrl: new URL('http://localhost/api/certificates?client_id=ahold&offset=5000') } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ certificates: [], total: 37, has_more: false, unmatched_terms: [], terms_capped: false })
    // The count runs through the same filters, without a window.
    expect(calls).toContainEqual(['select', expect.any(String), { count: 'exact', head: true }])
    expect(calls.filter((c) => c[0] === 'eq' && c[1] === 'sample.client_id')).toHaveLength(2)
    expect(calls.filter((c) => c[0] === 'range')).toHaveLength(1)
  })

  it('still narrows to one sample for the certificate editor', async () => {
    await GET({ nextUrl: new URL('http://localhost/api/certificates?sample_id=san-921') } as never)
    expect(calls).toContainEqual(['eq', 'sample_id', 'san-921'])
  })
})
