import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { sample: null as Record<string, unknown> | null }
  // Every insert the route makes, and every file it stores.
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = []
  const uploads: string[] = []
  const sendMail = vi.fn(async (_input: Record<string, unknown>) => {})
  const applyShipmentSampleApproval = vi.fn(async (_db: unknown, _input: Record<string, unknown>) => {})
  const resolveSampleContract = vi.fn(async (_db: unknown, _sample: unknown): Promise<unknown> => null)
  // QC staff: a global admin or a staff QC role. A /portal client account is not.
  const isStaffSampleManager = vi.fn(async (_db: unknown, _userId: string) => true)
  const fakeDb = () => ({
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.is = () => q
      q.limit = () => q
      q.single = async () => {
        if (table === 'samples') return { data: state.sample, error: null }
        if (table === 'profiles') {
          return {
            data: { full_name: 'Anderson Nunes', email: 'anderson@wolthers.com', email_signature_html: null },
            error: null,
          }
        }
        return { data: null, error: null }
      }
      q.maybeSingle = async () => {
        if (table === 'certificates') {
          return { data: { id: 'cert-877', pdf_url: null, certificate_number: 'SAK-011877/26' }, error: null }
        }
        if (table === 'document_types') return { data: { id: 'doc-type-qc' }, error: null }
        return { data: null, error: null }
      }
      q.insert = (payload: Record<string, unknown>) => {
        writes.push({ table, payload })
        return Promise.resolve({ error: null })
      }
      return q
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path)
          return { error: null }
        },
      }),
    },
  })
  return {
    state,
    writes,
    uploads,
    sendMail,
    applyShipmentSampleApproval,
    resolveSampleContract,
    isStaffSampleManager,
    fakeDb,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fakeDb() }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-anderson', email: 'anderson@wolthers.com' } } }) },
  }),
}))
vi.mock('@/lib/auth/sample-access', () => ({
  canUserManageSample: async () => ({ allowed: true }),
  isStaffSampleManager: h.isStaffSampleManager,
}))
vi.mock('@/lib/graph/send', () => ({ sendMail: h.sendMail }))
vi.mock('@/lib/certificate-storage', () => ({
  getCachedCertificatePdf: async () => null,
  uploadCertificatePdf: async () => {},
}))
vi.mock('@/lib/certificate-render', () => ({ renderCertificatePdfBuffer: async () => Buffer.from('%PDF-1.4') }))
vi.mock('@/lib/approval-notification/shipment-sample-writeback', () => ({
  applyShipmentSampleApproval: h.applyShipmentSampleApproval,
}))
vi.mock('@/lib/approval-notification/contract-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/contract-resolver')>()),
  resolveSampleContract: h.resolveSampleContract,
}))
vi.mock('@/lib/approval-notification/quality-summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/quality-summary')>()),
  fetchQualitySampleSummaries: async () => new Map(),
}))

import { POST } from './route'

// SAN-00921/26 — certificate SAK-011877/26 — registered without a Wolthers contract.
const unlinkedAholdLot = {
  id: 'san-921',
  tracking_number: 'SAN-00921/26',
  status: 'approved',
  sample_type: 'ss',
  contract_id: null,
  wolthers_contract_nr: null,
  buyer_contract_nr: 'IR0007621-1',
  seller_contract_nr: null,
  lab_source_sample_id: null,
  client_id: 'ahold',
  importer_id: 'ahold',
  seller_id: 'ldc-suisse',
  exporter_id: 'dreyfus',
}

const request = () =>
  ({
    json: async () => ({
      side: 'buyer',
      companyId: 'ahold',
      to: ['sven.drillenburg@adcoffeecompany.nl'],
      subject: 'PSS Quality Report / LDC Suisse for Ahold',
      bodyText: 'Dear Sven,',
      certificates: [{ sampleId: 'san-921' }],
    }),
  }) as never

beforeEach(() => {
  vi.stubEnv('MICROSOFT_GRAPH_TEST_RECIPIENT', '')
  h.state.sample = { ...unlinkedAholdLot }
  h.writes.length = 0
  h.uploads.length = 0
  h.sendMail.mockClear()
  h.applyShipmentSampleApproval.mockClear()
  h.resolveSampleContract.mockReset()
  h.resolveSampleContract.mockResolvedValue(null)
  h.isStaffSampleManager.mockReset()
  h.isStaffSampleManager.mockResolvedValue(true)
})

describe('POST /api/certificates/batch-send — a certificate with no sys contract', () => {
  it("emails it and logs the send against the certificate, with the sample's own parties", async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, results: [{ sampleId: 'san-921', ok: true }] })
    expect(h.sendMail).toHaveBeenCalledTimes(1)
    expect(h.sendMail.mock.calls[0][0]).toMatchObject({ to: ['sven.drillenburg@adcoffeecompany.nl'] })

    const log = h.writes.find((w) => w.table === 'email_messages')
    expect(log?.payload).toMatchObject({
      status: 'sent',
      contract_id: null,
      buyer_id: 'ahold',
      seller_id: 'ldc-suisse',
      metadata: expect.objectContaining({ source: 'batch_approval', sample_id: 'san-921', side: 'buyer' }),
    })
    // The audit trail records the send against the sample, by the sender.
    const audit = h.writes.find((w) => w.table === 'sample_events')
    expect(audit?.payload).toEqual([
      expect.objectContaining({
        sample_id: 'san-921', event_type: 'certificate_sent', actor_user_id: 'user-anderson',
        metadata: expect.objectContaining({ source: 'batch_approval', side: 'buyer', attached: true }),
      }),
    ])
  })

  it('annexes nothing and writes nothing back to sys, having no contract to do it on', async () => {
    await POST(request())
    expect(h.applyShipmentSampleApproval).not.toHaveBeenCalled()
    expect(h.uploads).toEqual([])
    expect(h.writes.map((w) => w.table)).toEqual(['email_messages', 'sample_events'])
  })

  // The gate that skips the contract steps must leave a linked lot untouched.
  it('still annexes the certificate to a linked contract and writes the decision back', async () => {
    h.resolveSampleContract.mockResolvedValue({
      contractId: 'contract-41923',
      buyerId: 'ahold',
      sellerId: 'ldc-suisse',
      buyerReference: 'IR0007621-1',
      sellerReference: 'S030103',
      contractNumber: '41923/26',
    })
    await POST(request())
    expect(h.uploads).toEqual(['contract-41923/quality-certificate-SAN-00921_26.pdf'])
    expect(h.applyShipmentSampleApproval).toHaveBeenCalledTimes(1)
    expect(h.applyShipmentSampleApproval.mock.calls[0][1]).toMatchObject({
      contractId: 'contract-41923',
      waqcRef: 'SAN-00921/26',
      decision: 'approved',
      sampleType: 'ss',
    })
  })
})

// The route reads and sends with the service role, and canUserManageSample lets
// a /portal client through for its own lots — so without a staff check a client
// account could mail any address from qualitycontrol@wolthers.com. The queue
// route that feeds this composer already requires QC staff.
describe('POST /api/certificates/batch-send — who may send', () => {
  it('refuses a user who is not QC staff before anything is sent or written', async () => {
    h.isStaffSampleManager.mockResolvedValue(false)
    const res = await POST(request())
    expect(res.status).toBe(403)
    expect(h.sendMail).not.toHaveBeenCalled()
    expect(h.writes).toEqual([])
  })
})
