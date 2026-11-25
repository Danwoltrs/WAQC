import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, any>
  const state = { sample: null as Record<string, unknown> | null }
  // Rows the seller-request store reads and writes (array reads, updates).
  const tables: Record<string, Row[]> = {}
  // Tables whose array reads fail the way a statement timeout does.
  const failing = new Set<string>()
  // Every insert the route makes, every update, and every file it stores.
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = []
  const updates: Array<{ table: string; values: Row }> = []
  const uploads: string[] = []
  const sendMail = vi.fn(async (_input: Record<string, any>): Promise<unknown> => null)
  const applyShipmentSampleApproval = vi.fn(async (_db: unknown, _input: Record<string, unknown>) => {})
  const recordBuyerSampleRequest = vi.fn(async (_db: unknown, _input: Record<string, any>) => {})
  const resolveSampleContract = vi.fn(async (_db: unknown, _sample: unknown): Promise<unknown> => null)
  // QC staff: a global admin or a staff QC role. A /portal client account is not.
  const isStaffSampleManager = vi.fn(async (_db: unknown, _userId: string) => true)
  const buildQualitySummaryHtml = vi.fn((_groups: unknown, _opts: unknown) => '')
  // The quality table rows, empty unless a test hands some in.
  const summaries = { byId: new Map<string, unknown>() }
  const fakeDb = () => ({
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let pending: Row | null = null
      const matching = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (column: string, value: unknown) => {
        filters.push((r) => r[column] === value)
        return q
      }
      q.in = (column: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[column]))
        return q
      }
      q.is = () => q
      q.order = () => q
      q.limit = () => q
      q.update = (values: Row) => {
        pending = values
        return q
      }
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        let result: { data: unknown; error: unknown }
        if (pending) {
          const hit = matching()
          for (const r of hit) Object.assign(r, pending)
          updates.push({ table, values: pending })
          result = { data: hit, error: null }
        } else if (failing.has(table)) {
          result = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        } else {
          result = { data: matching().map((r) => ({ ...r })), error: null }
        }
        return Promise.resolve(result).then(resolve, reject)
      }
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
        if (tables[table]) return { data: matching()[0] ?? null, error: null }
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
    tables,
    failing,
    writes,
    updates,
    uploads,
    sendMail,
    applyShipmentSampleApproval,
    recordBuyerSampleRequest,
    resolveSampleContract,
    isStaffSampleManager,
    buildQualitySummaryHtml,
    summaries,
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
vi.mock('@/lib/seller-requests/sys-buyer-request', () => ({
  recordBuyerSampleRequest: h.recordBuyerSampleRequest,
}))
vi.mock('@/lib/approval-notification/contract-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/contract-resolver')>()),
  resolveSampleContract: h.resolveSampleContract,
}))
vi.mock('@/lib/approval-notification/quality-summary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/approval-notification/quality-summary')>()),
  fetchQualitySampleSummaries: async () => h.summaries.byId,
  buildQualitySummaryHtml: h.buildQualitySummaryHtml,
}))

import { POST } from './route'
import * as render from '@/lib/approval-notification/quality-summary-render'

// The real table renderer, for the tests that read what the seller is sent.
const realSummaryHtml = (groups: unknown, opts: unknown) =>
  render.buildQualitySummaryHtml(groups as never, opts as never)

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

const baseBody = {
  side: 'buyer',
  companyId: 'ahold',
  to: ['sven.drillenburg@adcoffeecompany.nl'],
  subject: 'PSS Quality Report / LDC Suisse for Ahold',
  bodyText: 'Dear Sven,',
  certificates: [{ sampleId: 'san-921' }],
}
const request = (over: Record<string, unknown> = {}) =>
  ({ json: async () => ({ ...baseBody, ...over }) }) as never

beforeEach(() => {
  vi.stubEnv('MICROSOFT_GRAPH_TEST_RECIPIENT', '')
  h.state.sample = { ...unlinkedAholdLot }
  h.writes.length = 0
  h.updates.length = 0
  h.uploads.length = 0
  h.failing.clear()
  h.summaries.byId = new Map()
  for (const key of Object.keys(h.tables)) delete h.tables[key]
  // What the seller-request store reads: the sample, its client, the client's rule.
  h.tables.samples = [
    {
      id: 'san-921', sample_type: 'pss', status: 'approved', client_id: 'ahold', laboratory_id: 'hq', quality_spec_id: null,
      importer_id: 'ahold', roaster_id: null, wolthers_contract_nr: null, seller_requests: null,
    },
  ]
  h.tables.companies = [
    { id: 'ahold', name: 'Ahold Delhaize Coffee Company B.V.', fantasy_name: 'Ahold', country: 'Netherlands', group_id: null },
    { id: 'ldc-suisse', name: 'Louis Dreyfus Company Suisse S.A.', fantasy_name: 'LDC Suisse', country: 'Switzerland' },
    { id: 'cooxupe', name: 'Cooperativa Regional de Cafeicultores em Guaxupé', fantasy_name: 'Cooxupé', country: 'Brazil' },
  ]
  h.tables.qc_client_settings = [
    { company_id: 'ahold', laboratory_id: 'hq', final_word: 'wolthers', final_word_fixed: true, buyer_sample_address_id: null, stuffing_request: 'off' },
  ]
  h.sendMail.mockClear()
  h.applyShipmentSampleApproval.mockClear()
  h.recordBuyerSampleRequest.mockClear()
  h.resolveSampleContract.mockReset()
  h.resolveSampleContract.mockResolvedValue(null)
  h.isStaffSampleManager.mockReset()
  h.isStaffSampleManager.mockResolvedValue(true)
  h.buildQualitySummaryHtml.mockReset()
  h.buildQualitySummaryHtml.mockReturnValue('')
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

const linkedContract = {
  contractId: 'contract-41923',
  buyerId: 'ahold',
  sellerId: 'ldc-suisse',
  buyerReference: 'IR0007621-1',
  sellerReference: 'S030103',
  contractNumber: '41923/26',
}

describe('POST /api/certificates/batch-send — each party', () => {
  beforeEach(() => h.resolveSampleContract.mockResolvedValue(linkedContract))

  const nothingFiled = () => {
    expect(h.writes.filter((w) => w.table === 'documents')).toHaveLength(0)
    expect(h.uploads).toHaveLength(0)
    expect(h.applyShipmentSampleApproval).not.toHaveBeenCalled()
  }

  it('an importer send files nothing on the contract and writes nothing to sys, even with a PDF', async () => {
    const res = await POST(request({ side: 'importer', certificates: [{ sampleId: 'san-921', attach: true }] }))
    expect(res.status).toBe(200)
    expect(h.sendMail.mock.calls[0][0].attachments).toHaveLength(1)
    nothingFiled()
  })

  it('a seller send with a PDF does not file or write back either', async () => {
    const res = await POST(request({ side: 'seller', certificates: [{ sampleId: 'san-921', attach: true }] }))
    expect(res.status).toBe(200)
    nothingFiled()
  })

  it('the client send still files and writes back', async () => {
    await POST(request({ side: 'buyer' }))
    expect(h.writes.filter((w) => w.table === 'documents')).toHaveLength(1)
    expect(h.uploads).toHaveLength(1)
    expect(h.applyShipmentSampleApproval).toHaveBeenCalledTimes(1)
  })

  it.each(['importer', 'roaster'])('%s reads the client version', async (side) => {
    await POST(request({ side }))
    expect(h.buildQualitySummaryHtml.mock.calls[0][1]).toEqual({ sellerComment: false, audience: 'buyer', language: 'en' })
  })

  it('the attach flag is per certificate', async () => {
    await POST(request({ side: 'importer', certificates: [{ sampleId: 'a', attach: true }, { sampleId: 'b', attach: false }] }))
    expect(h.sendMail.mock.calls[0][0].attachments).toHaveLength(1)
  })

  it('an importer gets no PDF unless asked', async () => {
    await POST(request({ side: 'importer' }))
    expect(h.sendMail.mock.calls[0][0].attachments).toHaveLength(0)
  })

  it('logs the send against the party', async () => {
    await POST(request({ side: 'roaster' }))
    expect(h.writes.find((w) => w.table === 'email_messages')!.payload.metadata).toMatchObject({ side: 'roaster' })
  })

  it('refuses an unknown party', async () => {
    expect((await POST(request({ side: 'nobody' }))).status).toBe(400)
    expect(h.sendMail).not.toHaveBeenCalled()
  })
})

describe('POST /api/certificates/batch-send — a certificate with only a roaster', () => {
  beforeEach(() => {
    h.state.sample = {
      ...unlinkedAholdLot,
      client_id: null,
      importer_id: null,
      roaster_id: 'roaster-1',
      seller_id: null,
      exporter_id: null,
    }
  })

  it('is sent to the roaster and files nothing on a contract', async () => {
    const res = await POST(
      request({ side: 'roaster', companyId: 'roaster-1', certificates: [{ sampleId: 'san-921', attach: true }] }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, results: [{ sampleId: 'san-921', ok: true }] })
    expect(h.sendMail).toHaveBeenCalledTimes(1)
    expect(h.writes.filter((w) => w.table === 'documents')).toHaveLength(0)
    expect(h.uploads).toHaveLength(0)
    expect(h.applyShipmentSampleApproval).not.toHaveBeenCalled()
  })
})

describe('POST /api/certificates/batch-send — the cover is draft markup', () => {
  it('renders bold in the HTML and plain text in the text part', async () => {
    const res = await POST(request({ bodyText: '**Olá**' }))
    expect(res.status).toBe(200)
    const mail = h.sendMail.mock.calls[0][0]
    expect(mail.bodyHtml).toContain('<strong>Olá</strong>')
    expect(mail.bodyText.split('\n')[0]).toBe('Olá')
    expect(mail.bodyText).not.toContain('**')
  })

  it('refuses a language other than EN or BR', async () => {
    expect((await POST(request({ language: 'de' }))).status).toBe(400)
    expect(h.sendMail).not.toHaveBeenCalled()
  })

  it('logs the language on a buyer send, with no seller requests', async () => {
    await POST(request({ language: 'pt' }))
    const meta = h.writes.find((w) => w.table === 'email_messages')!.payload.metadata as Record<string, unknown>
    expect(meta.language).toBe('pt')
    expect(meta).not.toHaveProperty('seller_requests')
    expect(h.buildQualitySummaryHtml.mock.calls[0][1]).toMatchObject({ language: 'pt', audience: 'buyer' })
  })

  // No signature on the profile: the sign-off is the email's own language.
  it('a BR email without a signature signs off in Portuguese', async () => {
    await POST(request({ language: 'pt' }))
    const mail = h.sendMail.mock.calls[0][0]
    expect(mail.bodyText.endsWith('Atenciosamente,\nWolthers & Associates')).toBe(true)
    expect(mail.bodyHtml).toContain('Atenciosamente,')
    expect(mail.bodyText).not.toContain('Best regards')
    expect(mail.bodyHtml).not.toContain('Best regards')
  })

  it('an EN email without a signature signs off in English', async () => {
    await POST(request({ language: 'en' }))
    expect(h.sendMail.mock.calls[0][0].bodyText.endsWith('Best regards,\nWolthers & Associates')).toBe(true)
  })

  it('without a language, a party is written to in its own (a Brazilian seller: BR)', async () => {
    await POST(request({ side: 'seller', companyId: 'cooxupe' }))
    expect(h.buildQualitySummaryHtml.mock.calls[0][1]).toMatchObject({ language: 'pt', audience: 'seller' })
    expect(h.writes.find((w) => w.table === 'email_messages')!.payload.metadata).toMatchObject({ language: 'pt' })
  })
})

describe('POST /api/certificates/batch-send — seller requests', () => {
  const ahold = {
    companyId: 'ahold', companyName: 'Ahold', savedAddressId: null, lines: ['Hoogoorddreef 15', '1101 BA Amsterdam'],
    country: 'Netherlands', recipientName: null, attention: 'QC Lab', phone: null, instructions: null,
  }
  const ticked = { buyerSample: ahold, finalClientSample: null, stuffing: false, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null }
  // The Ahold PSS from the top of this file, approved, with its table row.
  const pssSummary = {
    sampleId: 'san-921', qcClientName: 'Ahold', sellerName: 'LDC Suisse', exporterSampleNumber: null,
    sellerContractNr: null, wolthersContractNr: null, buyerContractNr: 'IR0007621-1',
    certificateNumber: 'SAK-011877/26', containerNr: null, icoNumber: null, sampleType: 'pss',
    qualityName: 'NY 2/3 SC 17/18', screen: [{ key: '17', label: '17', pct: 40, isPan: false, sortKey: 17 }],
    defects: 8, typeOk: true, cupOk: true, decision: 'approved', reason: null, sellerComment: null,
  }
  const sellerPost = (over: Record<string, unknown> = {}) =>
    POST(request({ side: 'seller', companyId: 'ldc-suisse', language: 'pt', ...over }))
  const sentHtml = () => h.sendMail.mock.calls[0][0].bodyHtml as string
  const stored = () => h.tables.samples[0].seller_requests as Record<string, any> | null
  const emailMeta = () => h.writes.find((w) => w.table === 'email_messages')!.payload.metadata as Record<string, any>
  const events = () =>
    h.writes.filter((w) => w.table === 'sample_events').flatMap((w) => w.payload as unknown as Array<Record<string, any>>)

  beforeEach(() => {
    h.state.sample = { ...unlinkedAholdLot, sample_type: 'pss' }
    h.summaries.byId = new Map([['san-921', pssSummary]])
    h.buildQualitySummaryHtml.mockImplementation(realSummaryHtml)
  })

  // Review Focus 2: a stale composer posts a destination for Ahold, whose rule is
  // "Wolthers has the final word", fixed. The server keeps the lock.
  it('keeps a Wolthers-fixed buyer sample off: stored null, and no Pré-aprovado line goes out', async () => {
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(stored()).toMatchObject({ buyer_sample: null, set_by: 'user-anderson' })
    // The table was rendered in BR, so a missing line is the lock, not a missing table.
    expect(sentHtml()).toContain('APROVADO')
    expect(sentHtml()).not.toContain('Pré-aprovado')
  })

  it('an unlocked buyer sample is saved and printed — the line the lock withholds', async () => {
    h.tables.qc_client_settings[0].final_word_fixed = false
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(stored()?.buyer_sample.company_name).toBe('Ahold')
    expect(sentHtml()).toContain('Pré-aprovado pela Wolthers – favor enviar 1 amostra para Ahold:')
    expect(h.sendMail.mock.calls[0][0].bodyText).toContain('Pré-aprovado pela Wolthers – favor enviar 1 amostra para Ahold:')
  })

  it('the request lines follow the language: EN when the seller reads English', async () => {
    h.tables.qc_client_settings[0].final_word_fixed = false
    await sellerPost({ language: 'en', sellerRequests: { 'san-921': ticked } })
    expect(sentHtml()).toContain('Pre-approved by Wolthers – please send 1 sample to Ahold:')
    expect(sentHtml()).not.toContain('Pré-aprovado')
  })

  it('logs the language and the requests that went out, and a seller_requests_sent event', async () => {
    h.tables.qc_client_settings[0].final_word_fixed = false
    await sellerPost({ sellerRequests: { 'san-921': { ...ticked, stuffing: true } } })
    expect(emailMeta()).toMatchObject({
      language: 'pt',
      seller_requests: { 'san-921': { buyer_sample: expect.objectContaining({ company_name: 'Ahold' }), stuffing: true } },
    })
    expect(events().find((e) => e.event_type === 'seller_requests_sent')).toMatchObject({
      sample_id: 'san-921',
      actor_user_id: 'user-anderson',
      metadata: { buyer_sample: 'Ahold', stuffing: true },
    })
  })

  it('logs no seller_requests_sent event when nothing is requested', async () => {
    await sellerPost()
    expect(emailMeta().seller_requests).toEqual({
      'san-921': expect.objectContaining({ buyer_sample: null, stuffing: false }),
    })
    expect(events().map((e) => e.event_type)).toEqual(['certificate_sent'])
  })

  it('without ticks in the call, prints what is stored', async () => {
    h.tables.qc_client_settings[0].final_word_fixed = false
    h.tables.samples[0].seller_requests = {
      buyer_sample: {
        company_id: 'ahold', company_name: 'Ahold', saved_address_id: null, lines: ['Hoogoorddreef 15'],
        country: null, recipient_name: null, attention: null, phone: null, instructions: null,
      },
      stuffing: true, set_by: 'user-cupper', set_at: '2026-11-17T10:00:00Z',
    }
    await sellerPost()
    expect(h.updates).toEqual([])
    expect(sentHtml()).toContain('Pré-aprovado pela Wolthers – favor enviar 1 amostra para Ahold:')
    expect(sentHtml()).toContain('Favor nos informar data, hora e local da estufagem')
  })

  it('drops a malformed request entry and still sends', async () => {
    h.tables.qc_client_settings[0].final_word_fixed = false
    const res = await sellerPost({ sellerRequests: { 'san-921': { buyerSample: 'nope' } } })
    expect(res.status).toBe(200)
    expect(h.updates).toEqual([])
    expect(stored()).toBeNull()
  })

  it('saves ticks only on the PSS certificates in the unit', async () => {
    h.state.sample = { ...unlinkedAholdLot } // an SS lot
    h.tables.qc_client_settings[0].final_word_fixed = false
    await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(h.updates).toEqual([])
  })

  it('saves ticks only on APPROVED PSS certificates: a rejected PSS keeps what it has', async () => {
    h.state.sample = { ...unlinkedAholdLot, sample_type: 'pss', status: 'rejected' }
    h.tables.samples[0].status = 'rejected'
    h.tables.qc_client_settings[0].final_word_fixed = false
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(h.updates).toEqual([])
    expect(stored()).toBeNull()
  })

  it('a failed request read never blocks the email: it goes out without request lines', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.tables.qc_client_settings[0].final_word_fixed = false
    h.tables.samples[0].seller_requests = {
      buyer_sample: {
        company_id: 'ahold', company_name: 'Ahold', saved_address_id: null, lines: ['Hoogoorddreef 15'],
        country: null, recipient_name: null, attention: null, phone: null, instructions: null,
      },
      stuffing: true, set_by: 'user-cupper', set_at: '2026-11-17T10:00:00Z',
    }
    h.failing.add('qc_client_settings')
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(h.sendMail).toHaveBeenCalledTimes(1)
    expect(sentHtml()).toContain('APROVADO')
    expect(sentHtml()).not.toContain('Pré-aprovado')
    expect(emailMeta().seller_requests).toEqual({})
    expect(events().map((e) => e.event_type)).toEqual(['certificate_sent'])
    err.mockRestore()
  })
})

describe('POST /api/certificates/batch-send — the buyer sample is recorded on sys', () => {
  const ahold = {
    companyId: 'ahold', companyName: 'Ahold', savedAddressId: null, lines: ['Hoogoorddreef 15', '1101 BA Amsterdam'],
    country: 'Netherlands', recipientName: null, attention: 'QC Lab', phone: null, instructions: null,
  }
  const ticked = { buyerSample: ahold, finalClientSample: null, stuffing: false, additionalSample: false, ssPerContainer: false, setBy: null, setAt: null }
  const pssSummary = {
    sampleId: 'san-921', qcClientName: 'Ahold', sellerName: 'LDC Suisse', exporterSampleNumber: null,
    sellerContractNr: null, wolthersContractNr: null, buyerContractNr: 'IR0007621-1',
    certificateNumber: 'SAK-011877/26', containerNr: null, icoNumber: null, sampleType: 'pss',
    qualityName: 'NY 2/3 SC 17/18', screen: [{ key: '17', label: '17', pct: 40, isPan: false, sortKey: 17 }],
    defects: 8, typeOk: true, cupOk: true, decision: 'approved', reason: null, sellerComment: null,
  }
  const ids = { graphMessageId: 'm1', internetMessageId: '<x@y>', conversationId: 'c1' }
  const sellerPost = (over: Record<string, unknown> = {}) =>
    POST(request({ side: 'seller', companyId: 'ldc-suisse', language: 'pt', ...over }))
  const sentHtml = () => h.sendMail.mock.calls[0][0].bodyHtml as string
  const sentMeta = () => h.writes.find((w) => w.table === 'email_messages')!.payload.metadata as Record<string, any>
  const sentEvents = () =>
    h.writes.filter((w) => w.table === 'sample_events').flatMap((w) => w.payload as unknown as Array<Record<string, any>>)
  const LINE = 'Pré-aprovado pela Wolthers – favor enviar 1 amostra para Ahold:'

  beforeEach(() => {
    h.state.sample = { ...unlinkedAholdLot, sample_type: 'pss' }
    h.summaries.byId = new Map([['san-921', pssSummary]])
    h.buildQualitySummaryHtml.mockImplementation(realSummaryHtml)
    h.tables.qc_client_settings[0].final_word_fixed = false
  })

  it('a live send on a linked contract asks Graph for the ids and records the request with them', async () => {
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    h.sendMail.mockResolvedValueOnce(ids)
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(h.sendMail.mock.calls[0][0]).toMatchObject({ returnIds: true })
    expect(h.recordBuyerSampleRequest).toHaveBeenCalledTimes(1)
    expect(h.recordBuyerSampleRequest.mock.calls[0][1]).toEqual({
      sampleId: 'san-921',
      contractId: 'contract-41923',
      waqcRef: 'SAN-00921/26',
      sellerId: 'ldc-suisse',
      destination: expect.objectContaining({ companyId: 'ahold', companyName: 'Ahold' }),
      userId: 'user-anderson',
      email: {
        to: ['sven.drillenburg@adcoffeecompany.nl'],
        cc: ['wolthers@wolthers.com'],
        subject: 'PSS Quality Report / LDC Suisse for Ahold',
        bodyMarkup: 'Dear Sven,',
        language: 'pt',
        ids,
      },
      kind: 'buyer',
    })
  })

  it('a final-client sample is recorded on sys after the buyer one, with its own kind, and printed with its purpose', async () => {
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    h.sendMail.mockResolvedValueOnce(ids)
    const nespresso = { ...ahold, companyId: 'nespresso', companyName: 'Nespresso', lines: ['Lausanne'], attention: null }
    const res = await sellerPost({
      sellerRequests: {
        'san-921': { ...ticked, finalClientSample: { destination: nespresso, purpose: 'final_approval' }, ssPerContainer: true },
      },
    })
    expect(res.status).toBe(200)
    expect(h.sendMail.mock.calls[0][0]).toMatchObject({ returnIds: true })
    expect(h.recordBuyerSampleRequest.mock.calls.map((c) => [c[1].kind, c[1].destination.companyName])).toEqual([
      ['buyer', 'Ahold'],
      ['final_client', 'Nespresso'],
    ])
    expect(sentHtml()).toContain('Aprovado pela Wolthers – favor enviar 1 amostra para Nespresso para aprovação final:')
    expect(sentHtml()).toContain('Favor enviar uma amostra de embarque (SS) de cada contêiner para o nosso laboratório.')
    expect(sentEvents().find((e) => e.event_type === 'seller_requests_sent')?.metadata).toMatchObject({
      buyer_sample: 'Ahold', final_client_sample: 'Nespresso', final_client_purpose: 'final_approval', ss_per_container: true,
    })
  })

  it('a final-client tick with no address is never saved, printed or recorded', async () => {
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    await sellerPost({
      sellerRequests: { 'san-921': { ...ticked, buyerSample: null, finalClientSample: { destination: null, purpose: 'pre_approval' } } },
    })
    expect(h.sendMail.mock.calls[0][0].returnIds).toBeFalsy()
    expect(h.recordBuyerSampleRequest).not.toHaveBeenCalled()
    expect(sentMeta().seller_requests).toEqual({ 'san-921': expect.objectContaining({ final_client_sample: null }) })
  })

  it('a unit without a buyer sample sends as before: no ids asked, nothing recorded', async () => {
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    await sellerPost({ sellerRequests: { 'san-921': { ...ticked, buyerSample: null, stuffing: true } } })
    expect(h.sendMail.mock.calls[0][0].returnIds).toBeFalsy()
    expect(h.recordBuyerSampleRequest).not.toHaveBeenCalled()
  })

  it('a failed send records nothing on sys', async () => {
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    h.sendMail.mockRejectedValueOnce(new Error('Graph draft send failed: 500'))
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(502)
    expect(h.recordBuyerSampleRequest).not.toHaveBeenCalled()
  })

  // Review Focus 4: the lines still print, and nothing is written on sys.
  it('a sandbox send (MICROSOFT_GRAPH_TEST_RECIPIENT) records nothing on sys; the line still prints', async () => {
    vi.stubEnv('MICROSOFT_GRAPH_TEST_RECIPIENT', 'qa@wolthers.com')
    h.resolveSampleContract.mockResolvedValue(linkedContract)
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(h.recordBuyerSampleRequest).not.toHaveBeenCalled()
    expect(sentHtml()).toContain(LINE)
  })

  it('a contract-less lot records nothing on sys; the line still prints', async () => {
    const res = await sellerPost({ sellerRequests: { 'san-921': ticked } })
    expect(res.status).toBe(200)
    expect(h.recordBuyerSampleRequest).not.toHaveBeenCalled()
    expect(sentHtml()).toContain(LINE)
  })
})
