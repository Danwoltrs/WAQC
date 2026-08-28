import { describe, it, expect } from 'vitest'
import { getCertificatePageUrl } from './qr-code'

describe('getCertificatePageUrl', () => {
  it('slugifies a certificate number into the public path', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/\/certificate\/BR-036991_26$/)
  })

  it('produces an absolute http(s) url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).toMatch(/^https?:\/\//)
  })

  it('encodes nothing beyond the url', () => {
    expect(getCertificatePageUrl('BR-036991/26')).not.toContain('\n')
  })

  it('puts the buyer in front so two clients\' 000001/26 stay distinct', () => {
    expect(getCertificatePageUrl('000001/26', 'Arvid Nordquist'))
      .toMatch(/\/certificate\/arvid-nordquist\/000001_26$/)
  })

  it('falls back to the bare number when the buyer slugifies to nothing', () => {
    expect(getCertificatePageUrl('000001/26', '  ')).toMatch(/\/certificate\/000001_26$/)
  })
})

// ---------------------------------------------------------------------------
// fetchCertificateQRData — the QR payload for a contract sibling
// ---------------------------------------------------------------------------
import { fetchCertificateQRData } from './qr-code'

/** Records every filter so the test can assert WHICH row each table was read for. */
function fakeClient(rows: Record<string, unknown>) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const from = (table: string) => {
    const q: any = {}
    for (const op of ['select', 'eq', 'is', 'order', 'limit', 'in', 'ilike']) {
      q[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return q }
    }
    q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
    q.single = q.maybeSingle
    q.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? null, error: null })
    return q
  }
  return { client: { from }, calls }
}

describe('fetchCertificateQRData', () => {
  const rows = {
    samples: { id: 'sib', lab_source_sample_id: 'lab' },
    certificates: { client: { fantasy_name: 'Dunkin', name: 'Dunkin Donuts' } },
    quality_assessments: {
      green_bean_data: { screen_sizes: { '17': 50, '16': 50 }, defects: { total_primary: 2, total_secondary: 3 } },
    },
  }

  it('reads the lab data through the lab unit when the sample is a contract sibling', async () => {
    const { client, calls } = fakeClient(rows)
    const data = await fetchCertificateQRData(client, 'sib', 'BR-037251/26')
    const qa = calls.filter((c) => c.table === 'quality_assessments' && c.op === 'eq')
    expect(qa).toEqual([{ table: 'quality_assessments', op: 'eq', args: ['sample_id', 'lab'] }])
    expect(data.totalDefects).toBe(5)
    expect(data.primaryDefects).toBe(2)
    expect(data.buyerName).toBe('Dunkin')
  })

  it("looks the certificate up by the sample's own id and never by sample_contract_id", async () => {
    const { client, calls } = fakeClient(rows)
    await fetchCertificateQRData(client, 'sib', 'BR-037251/26')
    const certFilters = calls.filter((c) => c.table === 'certificates' && (c.op === 'eq' || c.op === 'is'))
    expect(certFilters).toEqual([{ table: 'certificates', op: 'eq', args: ['sample_id', 'sib'] }])
  })

  it('reads its own row when the sample is the lab unit', async () => {
    const { client, calls } = fakeClient({ ...rows, samples: { id: 'lab', lab_source_sample_id: null } })
    await fetchCertificateQRData(client, 'lab', 'BR-037250/26')
    const qa = calls.filter((c) => c.table === 'quality_assessments' && c.op === 'eq')
    expect(qa).toEqual([{ table: 'quality_assessments', op: 'eq', args: ['sample_id', 'lab'] }])
  })
})
