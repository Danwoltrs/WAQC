import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  labels: [] as any[],
  samples: [] as any[],
  certs: [] as any[],
  contracts: [] as any[],
  catalogue: [] as any[],
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      const rows = () =>
        table === 'samples' ? state.samples
          : table === 'certificates' ? state.certs
          : table === 'contracts' ? state.contracts
          : state.catalogue
      const q: any = {
        select: () => q,
        in: () => q,
        eq: () => q,
        order: () => q,
        then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
      }
      return q
    },
  }),
}))

vi.mock('@/components/pdf/sample-bag-sleeve-label', () => ({
  SampleBagSleeveLabelDocument: () => null,
}))

vi.mock('@react-pdf/renderer', () => ({
  renderToStream: async (element: any) => {
    state.labels = element.props.labels
    return (async function* () {
      yield new Uint8Array([1, 2, 3])
    })()
  },
}))

const qrSpy = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QR'))
vi.mock('@/lib/qr-code', async () => {
  const actual = await vi.importActual<typeof import('@/lib/qr-code')>('@/lib/qr-code')
  return { ...actual, generateQRCode: qrSpy }
})

import { POST } from './route'

const req = (body: unknown) =>
  new Request('http://localhost/api/samples/bulk/print-bag-sleeves', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any

const sample = {
  id: 's1',
  tracking_number: 'SAN-00921/26',
  sample_type: 'ss',
  created_at: '2026-10-01T12:00:00Z',
  container_nr: 'TEMU 565.799-2',
  ico_number: null,
  exporter_sample_number: null,
  wolthers_contract_nr: '41127/25',
  buyer_contract_nr: null,
  contract_id: null,
  client: { name: 'Dunkin Brands LLC', fantasy_name: 'Dunkin' },
  exporter: { name: 'Exp', fantasy_name: null },
  quality_spec: null,
  laboratory: null,
}

describe('POST /api/samples/bulk/print-bag-sleeves', () => {
  beforeEach(() => {
    state.labels = []
    state.samples = [sample]
    state.certs = [{ sample_id: 's1', certificate_number: 'BR-037529/26', created_at: '2026-10-02T10:00:00Z' }]
    state.contracts = []
    state.catalogue = []
    qrSpy.mockClear()
  })

  it('leads with the container, prints the certificate, and the QR opens the certificate page', async () => {
    const res = await POST(req({ samples: [{ id: 's1', includeQrCode: true }] }))
    expect(res.status).toBe(200)
    expect(state.labels[0]).toMatchObject({ headline: 'TEMU 565.799-2', certificate_number: 'BR-037529/26' })
    expect(JSON.stringify(state.labels)).not.toContain('SAN-')
    const content = (qrSpy.mock.calls[0] as any[])[0] as string
    expect(content).toContain('BR-037529_26')
    expect(content).not.toContain('SAN')
  })

  it('a PSS without a buyer number leads with its sample number', async () => {
    state.samples = [{ ...sample, sample_type: 'pss', exporter_sample_number: 'S-1548/26' }]
    const res = await POST(req({ samples: [{ id: 's1', includeQrCode: false }] }))
    expect(res.status).toBe(200)
    expect(state.labels[0]).toMatchObject({ headline: 'S-1548/26', type_line: 'PSS', certificate_number: 'BR-037529/26' })
  })

  it('leads with the buyer number, puts the sample number on the type line, and prints the contract quality', async () => {
    state.samples = [{
      ...sample,
      sample_type: 'pss',
      exporter_sample_number: '123453',
      buyer_contract_nr: '105950',
      quality_spec: { custom_name: 'Blaser Dulce 17/18', template: { name_en: 'Blaser Dulce 17/18', description: null } },
    }]
    state.contracts = [{
      id: 'c1', contract_number: '41127/25', status: 'active', updated_at: '2026-10-01',
      quality_description: 'Blaser Dulce 17/18', crop: '2026/2027', buyer_id: 'b1', quality_sc_text: null,
    }]
    state.catalogue = [{ company_id: 'b1', short_name: 'Blaser Dulce 17/18', full_description: 'Brazil NY 2/3, Screen 17/18, Fine Cup' }]
    const res = await POST(req({ samples: [{ id: 's1', includeQrCode: false }] }))
    expect(res.status).toBe(200)
    expect(state.labels[0]).toMatchObject({
      headline: '105950',
      type_line: 'PSS - 123453',
      client_quality_name: 'Blaser Dulce 17/18',
      quality_description: 'Brazil NY 2/3, Screen 17/18, Fine Cup, Crop 2026/2027.',
      contracts: [{ type: 'Wolthers', value: '41127/25' }],
    })
  })

  it('an uncertified sleeve gets no QR', async () => {
    state.certs = []
    const res = await POST(req({ samples: [{ id: 's1', includeQrCode: true }] }))
    expect(res.status).toBe(200)
    expect(state.labels[0].qr_code).toBeUndefined()
    expect(qrSpy).not.toHaveBeenCalled()
  })
})
