import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSyncIssue = vi.hoisted(() => vi.fn(async (_admin: unknown, _issue: Record<string, unknown>) => {}))
vi.mock('@/lib/approval-notification/sys-sync-issues', () => ({ insertSyncIssue }))

import { planBuyerRequest, recordBuyerSampleRequest, type SysPssRow } from './sys-buyer-request'
import type { BuyerSampleDestination } from './types'

const REF = 'SAN-00921/26'

const row = (over: Partial<SysPssRow>): SysPssRow => ({
  id: 'r1',
  waqc_ref: REF,
  sample_type: 'pss',
  status: 'approved',
  group_id: null,
  container_slot: null,
  shipment_id: null,
  split_id: null,
  pre_approval_of: null,
  created_at: '2026-11-01T00:00:00Z',
  ...over,
})
// One container-split PSS: three per-container leaves, all ours, all approved.
const leaf = (slot: number, over: Partial<SysPssRow> = {}) =>
  row({
    id: `leaf-${slot}`,
    group_id: 'g1',
    container_slot: slot,
    shipment_id: 'shipment-1',
    split_id: 'split-1',
    created_at: `2026-11-0${4 - slot}T00:00:00Z`, // slot 1 is the NEWEST: the slot wins, not the age
    ...over,
  })

describe('planBuyerRequest', () => {
  it('claims every approved leaf of a container group and anchors on slot 1', () => {
    const plan = planBuyerRequest([leaf(3), leaf(1), leaf(2)], REF)
    expect([...plan.claimedIds].sort()).toEqual(['leaf-1', 'leaf-2', 'leaf-3'])
    expect(plan.anchorId).toBe('leaf-1')
    expect(plan.existingRequestId).toBeNull()
  })

  it('anchors on the oldest row when no row has a slot', () => {
    const plan = planBuyerRequest(
      [row({ id: 'new', created_at: '2026-11-05T00:00:00Z' }), row({ id: 'old', created_at: '2026-11-01T00:00:00Z' })],
      REF,
    )
    expect(plan.anchorId).toBe('old')
  })

  it('never claims a rejected row or a row of another ref', () => {
    const plan = planBuyerRequest(
      [row({ id: 'ours' }), row({ id: 'rejected', status: 'rejected' }), row({ id: 'peer', waqc_ref: 'SAN-00777/26' })],
      REF,
    )
    expect(plan.claimedIds).toEqual(['ours'])
  })

  it('never claims the buyer request, and returns it as the existing request', () => {
    const plan = planBuyerRequest(
      [leaf(1), leaf(2), row({ id: 'request', waqc_ref: null, status: 'requested', pre_approval_of: 'leaf-1' })],
      REF,
    )
    expect(plan.claimedIds).not.toContain('request')
    expect(plan.existingRequestId).toBe('request')
  })

  it('has no anchor when nothing approved carries the ref', () => {
    expect(planBuyerRequest([row({ status: 'rejected' })], REF)).toEqual({
      claimedIds: [],
      anchorId: null,
      existingRequestId: null,
      existingRequestStatus: null,
    })
  })
})

type Op = 'select' | 'insert' | 'update' | 'delete'
interface Call { table: string; op: Op; payload?: Record<string, unknown>; filters: Record<string, unknown> }
type DbError = { code: string; message: string }

/** Records every call in order; each table's inserts get sequential ids.
 *  `reads` queues the data of successive shipment_samples selects (then `rows`). */
function fakeAdmin(rows: SysPssRow[], errors: Record<string, DbError[]> = {}, reads: unknown[][] = []) {
  const calls: Call[] = []
  let n = 0
  const admin = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: {} }
      const result = () => {
        calls.push(call)
        const queued = errors[`${table}:${call.op}`]?.shift()
        if (queued) return { data: null, error: queued }
        if (call.op === 'select') {
          if (table !== 'shipment_samples') return { data: [], error: null }
          return { data: reads.shift() ?? rows.map((r) => ({ ...r })), error: null }
        }
        if (call.op === 'insert') return { data: { id: `${table}-${++n}` }, error: null }
        return { data: null, error: null }
      }
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q,
        insert: (p: Record<string, unknown>) => { call.op = 'insert'; call.payload = p; return q },
        update: (p: Record<string, unknown>) => { call.op = 'update'; call.payload = p; return q },
        delete: () => { call.op = 'delete'; return q },
        eq: (c: string, v: unknown) => { call.filters[c] = v; return q },
        in: (c: string, v: unknown) => { call.filters[c] = v; return q },
        ilike: (c: string, v: unknown) => { call.filters[`${c}~`] = v; return q },
        is: (c: string, v: unknown) => { call.filters[c] = v; return q },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      })
      return q
    },
  }
  const writes = () => calls.filter((c) => c.op !== 'select')
  return { admin, calls, writes }
}

const blaser: BuyerSampleDestination = {
  companyId: 'blaser',
  companyName: 'Blaser',
  savedAddressId: 'addr-1',
  lines: ['Bern'],
  country: 'Switzerland',
  recipientName: null,
  attention: null,
  phone: null,
  instructions: null,
}

const args = (over: Record<string, unknown> = {}) => ({
  sampleId: 'san-921',
  contractId: 'contract-41923',
  waqcRef: REF,
  sellerId: 'ldc-suisse',
  destination: blaser,
  userId: 'user-anderson',
  email: {
    to: ['seller@ldc.com'],
    cc: ['wolthers@wolthers.com'],
    subject: 'PSS Quality Report / LDC Suisse for Blaser',
    bodyMarkup: 'Prezados,',
    language: 'pt' as const,
    ids: { graphMessageId: 'm1', internetMessageId: '<x@y>', conversationId: 'c1' },
  },
  ...over,
})

beforeEach(() => {
  insertSyncIssue.mockClear()
  vi.restoreAllMocks()
})
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('recordBuyerSampleRequest', () => {
  it('a first send marks our rows, opens the buyer request, then the batch and the pss_request, in order', async () => {
    const { admin, calls, writes } = fakeAdmin([leaf(2), leaf(1), leaf(3)])
    await recordBuyerSampleRequest(admin as never, args())

    // The read: the contract's PSS rows.
    expect(calls[0]).toMatchObject({ table: 'shipment_samples', op: 'select', filters: { contract_id: 'contract-41923', 'sample_type~': '%pss%' } })

    const w = writes()
    expect(w.map((c) => `${c.table}:${c.op}`)).toEqual([
      'shipment_samples:update',
      'shipment_samples:insert',
      'request_batches:insert',
      'pss_requests:insert',
    ])
    expect(w[0].payload).toEqual({ qc_pre_approved_at: expect.any(String) })
    expect([...(w[0].filters.id as string[])].sort()).toEqual(['leaf-1', 'leaf-2', 'leaf-3'])

    expect(w[1].payload).toEqual({
      contract_id: 'contract-41923',
      shipment_id: 'shipment-1',
      split_id: 'split-1',
      sample_type: 'pss',
      status: 'requested',
      source: 'sys',
      created_by: 'user-anderson',
      pre_approval_of: 'leaf-1',
      recipient_company_id: 'blaser',
      recipient_company_name: null,
    })

    expect(w[2].payload).toEqual({
      idempotency_key: 'waqc-buyer-sample:shipment_samples-1:<x@y>',
      kind: 'samples',
      origin: 'staff',
      seller_id: 'ldc-suisse',
      contract_ids: ['contract-41923'],
      buyer_company_ids: ['blaser'],
      items: [{ contract_id: 'contract-41923', sample_destination: 'Blaser', sample_destination_company_id: 'blaser' }],
      requested_by: 'user-anderson',
      language: 'pt',
      subject: 'PSS Quality Report / LDC Suisse for Blaser',
      body: 'Prezados,',
      to_emails: ['seller@ldc.com'],
      cc_emails: ['wolthers@wolthers.com'],
      status: 'sent',
      graph_message_id: 'm1',
      internet_message_id: '<x@y>',
      conversation_id: 'c1',
      sent_at: expect.any(String),
      sent_by: 'user-anderson',
    })

    expect(w[3].payload).toEqual({
      requested_by: 'user-anderson',
      request_method: 'email',
      email_to: ['seller@ldc.com'],
      email_cc: ['wolthers@wolthers.com'],
      subject: 'PSS Quality Report / LDC Suisse for Blaser',
      batch_id: 'request_batches-2',
      sample_id: 'shipment_samples-1',
      contract_id: 'contract-41923',
    })

    // contract_splits is the leg's lab destination: never ours to write.
    expect(calls.some((c) => c.table === 'contract_splits')).toBe(false)
    expect(insertSyncIssue).not.toHaveBeenCalled()
  })

  // Review Focus 3: "Include already sent" resends the seller email.
  it('resend updates, never duplicates', async () => {
    const request = row({ id: 'request', waqc_ref: null, status: 'requested', pre_approval_of: 'leaf-1' })
    const { admin, writes } = fakeAdmin([leaf(1), leaf(2), request])
    await recordBuyerSampleRequest(admin as never, args({ destination: { ...blaser, companyId: null, companyName: 'Blaser Bern Lab' } }))

    const w = writes()
    expect(w.map((c) => `${c.table}:${c.op}`)).toEqual([
      'shipment_samples:update',
      'shipment_samples:update',
      'request_batches:insert',
      'pss_requests:insert',
    ])
    expect(w.filter((c) => c.table === 'shipment_samples' && c.op === 'insert')).toEqual([])
    expect(w[1]).toMatchObject({
      filters: { id: 'request' },
      payload: { recipient_company_id: null, recipient_company_name: 'Blaser Bern Lab' },
    })
    expect(w[3].payload).toMatchObject({ sample_id: 'request', contract_id: 'contract-41923' })
  })

  // sys 0989: one buyer request per pre-approved row (unique). A double send
  // that races past the read hits 23505 on the insert: re-read and update.
  it('a 23505 on the request insert (a racing send) re-reads that request and updates it, never a second one', async () => {
    const racer = row({ id: 'racer', waqc_ref: null, status: 'requested', pre_approval_of: 'leaf-1' })
    const { admin, calls, writes } = fakeAdmin(
      [leaf(1), leaf(2)],
      { 'shipment_samples:insert': [{ code: '23505', message: 'duplicate key value violates unique constraint "shipment_samples_pre_approval_of_idx"' }] },
      [[leaf(1), leaf(2)], [racer]],
    )
    await recordBuyerSampleRequest(admin as never, args())

    const reread = calls.filter((c) => c.table === 'shipment_samples' && c.op === 'select')[1]
    expect(reread.filters).toEqual({ pre_approval_of: 'leaf-1' })
    const w = writes()
    expect(w.map((c) => `${c.table}:${c.op}`)).toEqual([
      'shipment_samples:update',
      'shipment_samples:insert',
      'shipment_samples:update',
      'request_batches:insert',
      'pss_requests:insert',
    ])
    expect(w[2]).toMatchObject({ filters: { id: 'racer' }, payload: { recipient_company_id: 'blaser', recipient_company_name: null } })
    expect(w[4].payload).toMatchObject({ sample_id: 'racer' })
    expect(insertSyncIssue).not.toHaveBeenCalled()
  })

  it('a 23505 whose request is no longer "requested" leaves it alone and still logs the pss_request against it', async () => {
    const racer = row({ id: 'racer', waqc_ref: null, status: 'pending', pre_approval_of: 'leaf-1' })
    const { admin, writes } = fakeAdmin(
      [leaf(1)],
      { 'shipment_samples:insert': [{ code: '23505', message: 'duplicate key value' }] },
      [[leaf(1)], [racer]],
    )
    await recordBuyerSampleRequest(admin as never, args())
    const w = writes()
    expect(w.some((c) => c.op === 'update' && c.filters.id === 'racer')).toBe(false)
    expect(w.at(-1)).toMatchObject({ table: 'pss_requests', op: 'insert', payload: { sample_id: 'racer' } })
    expect(insertSyncIssue).not.toHaveBeenCalled()
  })

  it('a 23505 with nothing found on the re-read is logged as buyer_request_error', async () => {
    quiet()
    const { admin, writes } = fakeAdmin(
      [leaf(1)],
      { 'shipment_samples:insert': [{ code: '23505', message: 'duplicate key value' }] },
      [[leaf(1)], []],
    )
    await recordBuyerSampleRequest(admin as never, args())
    expect(writes().some((c) => c.table === 'pss_requests')).toBe(false)
    expect(insertSyncIssue).toHaveBeenCalledWith(admin, expect.objectContaining({ reason: 'buyer_request_error' }))
  })

  it('a resend leaves a request that is no longer "requested" alone, but still logs the pss_request', async () => {
    const request = row({ id: 'request', waqc_ref: null, status: 'pending', pre_approval_of: 'leaf-1' })
    const { admin, writes } = fakeAdmin([leaf(1), leaf(2), request])
    await recordBuyerSampleRequest(admin as never, args())

    const w = writes()
    expect(w.some((c) => c.table === 'shipment_samples' && c.filters.id === 'request')).toBe(false)
    expect(w.filter((c) => c.table === 'shipment_samples' && c.op === 'insert')).toEqual([])
    expect(w.at(-1)).toMatchObject({ table: 'pss_requests', op: 'insert', payload: { sample_id: 'request' } })
  })

  it('with no approved row of ours on sys, logs buyer_request_no_target and writes nothing', async () => {
    const { admin, writes } = fakeAdmin([row({ status: 'rejected' }), row({ id: 'peer', waqc_ref: 'SAN-00777/26' })])
    await recordBuyerSampleRequest(admin as never, args())
    expect(writes()).toEqual([])
    expect(insertSyncIssue).toHaveBeenCalledTimes(1)
    expect(insertSyncIssue).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ sampleId: 'san-921', contractId: 'contract-41923', waqcRef: REF, stage: 'email', reason: 'buyer_request_no_target' }),
    )
  })

  it('a seller-less contract skips the batch (seller_id is required on sys); the pss_request has no batch', async () => {
    const { admin, writes } = fakeAdmin([row({})])
    await recordBuyerSampleRequest(admin as never, args({ sellerId: null }))
    const w = writes()
    expect(w.map((c) => `${c.table}:${c.op}`)).toEqual(['shipment_samples:update', 'shipment_samples:insert', 'pss_requests:insert'])
    expect(w[2].payload).toMatchObject({ batch_id: null })
  })

  it('without message ids the batch still records, keyed by time', async () => {
    const { admin, writes } = fakeAdmin([row({})])
    await recordBuyerSampleRequest(admin as never, args({ email: { ...args().email, ids: null } }))
    const batch = writes().find((c) => c.table === 'request_batches')!.payload!
    expect(batch.idempotency_key).toMatch(/^waqc-buyer-sample:shipment_samples-1:\d+$/)
    expect(batch).toMatchObject({ graph_message_id: null, internet_message_id: null, conversation_id: null })
  })

  it('a WAQC-only user (no sys profile) is recorded with null user columns', async () => {
    const fk = { code: '23503', message: 'insert or update violates foreign key constraint' }
    const { admin, writes } = fakeAdmin([row({})], {
      'shipment_samples:insert': [fk],
      'request_batches:insert': [fk],
      'pss_requests:insert': [fk],
    })
    await recordBuyerSampleRequest(admin as never, args())
    const inserts = writes().filter((c) => c.op === 'insert')
    expect(inserts.map((c) => c.table)).toEqual([
      'shipment_samples', 'shipment_samples', 'request_batches', 'request_batches', 'pss_requests', 'pss_requests',
    ])
    expect(inserts[1].payload).toMatchObject({ created_by: null, pre_approval_of: 'r1' })
    expect(inserts[3].payload).toMatchObject({ requested_by: null, sent_by: null })
    expect(inserts[5].payload).toMatchObject({ requested_by: null })
    expect(insertSyncIssue).not.toHaveBeenCalled()
  })

  it('any other error is logged as buyer_request_error and never thrown', async () => {
    quiet()
    const { admin } = fakeAdmin([row({})], { 'request_batches:insert': [{ code: '23505', message: 'duplicate key value' }] })
    await expect(recordBuyerSampleRequest(admin as never, args())).resolves.toBeUndefined()
    expect(insertSyncIssue).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ stage: 'email', reason: 'buyer_request_error', detail: { message: 'duplicate key value' } }),
    )
  })

  it('a failed read is logged as buyer_request_error and writes nothing', async () => {
    quiet()
    const { admin, writes } = fakeAdmin([row({})], {
      'shipment_samples:select': [{ code: '42703', message: 'column shipment_samples.pre_approval_of does not exist' }],
    })
    await recordBuyerSampleRequest(admin as never, args())
    expect(writes()).toEqual([])
    expect(insertSyncIssue).toHaveBeenCalledWith(admin, expect.objectContaining({ reason: 'buyer_request_error' }))
  })
})
