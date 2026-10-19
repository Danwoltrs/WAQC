import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  labels: [] as any[],
  samples: [] as any[],
  certs: [] as any[],
}))

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      const rows = () => (table === 'samples' ? state.samples : state.certs)
      const q: any = {
        select: () => q,
        in: () => q,
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

  it('an uncertified sleeve gets no QR', async () => {
    state.certs = []
    const res = await POST(req({ samples: [{ id: 's1', includeQrCode: true }] }))
    expect(res.status).toBe(200)
    expect(state.labels[0].qr_code).toBeUndefined()
    expect(qrSpy).not.toHaveBeenCalled()
  })
})
