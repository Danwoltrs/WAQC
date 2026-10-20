import { describe, it, expect } from 'vitest'
import { getCertificatePageUrl, getSamplePhotoUrl, buildCertificateQRText } from './qr-code'

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
    certificates: { id: 'c1', certificate_number: 'DD-000123/26', client: { fantasy_name: 'Dunkin', name: 'Dunkin Donuts' } },
    quality_assessments: {
      green_bean_data: { screen_sizes: { '17': 50, '16': 50 }, defects: { total_primary: 2, total_secondary: 3 } },
    },
  }

  it('reads the lab data through the lab unit when the sample is a contract sibling', async () => {
    const { client, calls } = fakeClient(rows)
    const data = await fetchCertificateQRData(client, 'sib', { exporter_sample_number: '144/26' })
    const qa = calls.filter((c) => c.table === 'quality_assessments' && c.op === 'eq')
    expect(qa).toEqual([{ table: 'quality_assessments', op: 'eq', args: ['sample_id', 'lab'] }])
    expect(data.totalDefects).toBe(5)
    expect(data.primaryDefects).toBe(2)
    expect(data.buyerName).toBe('Dunkin')
  })

  it("looks the certificate up by the sample's own id and never by sample_contract_id", async () => {
    const { client, calls } = fakeClient(rows)
    await fetchCertificateQRData(client, 'sib', { exporter_sample_number: '144/26' })
    const certFilters = calls.filter((c) => c.table === 'certificates' && (c.op === 'eq' || c.op === 'is'))
    expect(certFilters).toEqual([{ table: 'certificates', op: 'eq', args: ['sample_id', 'sib'] }])
  })

  it('reads its own row when the sample is the lab unit', async () => {
    const { client, calls } = fakeClient({ ...rows, samples: { id: 'lab', lab_source_sample_id: null } })
    await fetchCertificateQRData(client, 'lab', { exporter_sample_number: '144/26' })
    const qa = calls.filter((c) => c.table === 'quality_assessments' && c.op === 'eq')
    expect(qa).toEqual([{ table: 'quality_assessments', op: 'eq', args: ['sample_id', 'lab'] }])
  })
})

describe('fetchCertificateQRData — what names the lot', () => {
  const base = {
    samples: { id: 'sib', lab_source_sample_id: null },
    quality_assessments: null,
  }

  it('leads with the certificate number when one is issued', async () => {
    const { client } = fakeClient({ ...base, certificates: { id: 'c1', certificate_number: 'SAG-011895/26', client: null } })
    const data = await fetchCertificateQRData(client, 'sib', { container_nr: 'HASU 155.201-6' })
    expect(data.label).toBe('SAG-011895/26')
    expect(data.certificateNumber).toBe('SAG-011895/26')
  })

  it('treats a legacy lab-number certificate as absent and names the lot by its own identifier', async () => {
    const { client } = fakeClient({ ...base, certificates: { id: 'c1', certificate_number: 'SAN-01234/26', client: null } })
    const data = await fetchCertificateQRData(client, 'sib', { container_nr: 'HASU 155.201-6' })
    expect(data.label).toBe('CTR HASU 155.201-6')
    expect(data.certificateNumber).toBeNull()
    expect(JSON.stringify(data)).not.toMatch(/SAN-/)
  })

  it('falls back to a neutral word when the lot has no certificate and no identifier', async () => {
    const { client } = fakeClient({ ...base, certificates: null })
    const data = await fetchCertificateQRData(client, 'sib')
    expect(data.label).toBe('Sample')
    expect(data.certificateNumber).toBeNull()
  })
})

describe('buildCertificateQRText', () => {
  it('opens with the label and ends with the certificate page url', () => {
    const text = buildCertificateQRText({
      label: 'SAG-011895/26', certificateNumber: 'SAG-011895/26', buyerName: 'Ahold', totalDefects: 5,
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('SAG-011895/26')
    expect(lines[1]).toBe('Def: 5')
    expect(lines[lines.length - 1]).toMatch(/\/certificate\/ahold\/SAG-011895_26$/)
  })

  it('carries no url when there is no real certificate number', () => {
    const text = buildCertificateQRText({ label: 'SMP 144/26', certificateNumber: null })
    expect(text).toBe('SMP 144/26')
    expect(text).not.toMatch(/https?:/)
  })

  it('never builds a url from a lab number', () => {
    const text = buildCertificateQRText({ label: 'SMP 144/26', certificateNumber: 'SAN-01234/26' })
    expect(text).not.toMatch(/SAN/)
    expect(text).not.toMatch(/https?:/)
  })
})

describe('getSamplePhotoUrl', () => {
  it('names the photo page by the certificate number with the buyer as a tiebreaker', () => {
    expect(getSamplePhotoUrl({ sampleId: 'abc', certificateNumber: 'SAG-011895/26', buyerName: 'Arvid Nordquist' }))
      .toMatch(/\/sample-photo\/SAG-011895_26\?buyer=arvid-nordquist$/)
  })

  it('omits the buyer when there is none', () => {
    expect(getSamplePhotoUrl({ sampleId: 'abc', certificateNumber: 'SAG-011895/26' }))
      .toMatch(/\/sample-photo\/SAG-011895_26$/)
  })

  it('uses the sample id, never the lab number, when the certificate is a legacy lab number', () => {
    const url = getSamplePhotoUrl({ sampleId: '0b4c3f1e-1111-2222-3333-444455556666', certificateNumber: 'SAN-01234/26' })
    expect(url).toMatch(/\/sample-photo\/0b4c3f1e-1111-2222-3333-444455556666$/)
    expect(url).not.toMatch(/SAN/)
  })

  it('uses the sample id when no certificate exists', () => {
    expect(getSamplePhotoUrl({ sampleId: 'abc', certificateNumber: null })).toMatch(/\/sample-photo\/abc$/)
  })
})
