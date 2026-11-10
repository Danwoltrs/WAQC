import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const log: string[] = []
  const writes: Array<{ table: string; op: string; payload?: unknown }> = []
  const state = {
    optedIn: ['c1', 'c2'] as string[],
    settingsError: null as string | null,
    samplesUpdateError: null as string | null,
    // certificates as read before minting, and the ids present when undo reads them
    certsBefore: [] as Array<Record<string, unknown>>,
    certsNow: ['cert-1'] as string[],
    certReads: 0,
    // the group as read before anything is written
    members: [] as Array<Record<string, unknown>>,
    membersError: null as string | null,
  }
  const fakeDb = () => ({
    rpc: async (fn: string, args: Record<string, string>) => {
      log.push(`${fn === 'void_certificate' ? 'void' : fn} ${args.p_certificate_id}`)
      return { error: null }
    },
    from(table: string) {
      let op = 'select'
      let payload: unknown
      let ids: string[] = []
      const resolve = () => {
        if (op === 'update') {
          writes.push({ table, op, payload })
          log.push(table === 'certificates' ? `restore certificates ${ids.join(',')}` : `update ${table}`)
          return { error: table === 'samples' && state.samplesUpdateError ? { message: state.samplesUpdateError } : null }
        }
        if (op === 'delete') {
          writes.push({ table, op })
          log.push(`delete ${table} ${ids.join(',')}`.trim())
          return { error: null }
        }
        if (table === 'certificates') {
          state.certReads += 1
          return state.certReads === 1
            ? { data: state.certsBefore, error: null }
            : { data: state.certsNow.map((id) => ({ id })), error: null }
        }
        if (table === 'samples') {
          return state.membersError ? { data: null, error: { message: state.membersError } } : { data: state.members, error: null }
        }
        if (table === 'qc_client_settings') {
          return state.settingsError
            ? { data: null, error: { message: state.settingsError } }
            : { data: state.optedIn.map((company_id) => ({ company_id })), error: null }
        }
        return { data: null, error: null }
      }
      const q: Record<string, any> = {}
      q.select = () => q
      q.eq = (_c: string, v: unknown) => { if (op === 'delete' || op === 'update') ids.push(String(v)); return q }
      q.in = (_c: string, v: string[]) => { if (op === 'delete' || op === 'update') ids = ids.concat(v); return q }
      q.insert = (p: unknown) => { op = 'insert'; payload = p; writes.push({ table, op, payload }); log.push(`insert ${table}`); return q }
      q.update = (p: unknown) => { op = 'update'; payload = p; return q }
      q.delete = () => { op = 'delete'; return q }
      q.single = async () =>
        op === 'insert' ? { data: { id: 'audit-1' }, error: null } : { data: { full_name: 'Dan', email: 'd@x.com', email_signature_html: null }, error: null }
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(resolve()).then(res, rej)
      return q
    },
  })
  const okMint = () => ({
    certificate: { id: 'cert-1', certificate_number: 'SAK-1/26' },
    group: {
      minted: ['lab-1'], revised: [], unchanged: [], failed: [],
      certificates: { 'lab-1': { id: 'cert-1', certificate_number: 'SAK-1/26' } },
    },
  })
  const applyDecision = vi.fn(async (_db: unknown, _i: Record<string, unknown>) => {})
  const mintCertificates = vi.fn(async (_db: unknown, _i: Record<string, unknown>) => {
    log.push('mint')
    return okMint() as any
  })
  const evaluateSampleCompliance = vi.fn(async (..._a: unknown[]) => [])
  const evaluate = vi.fn((_c: unknown) => ({
    offered: true,
    items: [{ metric: 'screen_18' }],
    blockedBy: [] as string[],
  }) as any)
  const issued = vi.fn(async (..._a: unknown[]) => ({ ok: true, issued: { screen_percentages: { '18': 30 }, defects: null } }) as any)
  const writeback = vi.fn(async (..._a: unknown[]) => { log.push('writeback') })
  const seller = vi.fn(async (..._a: unknown[]) => { log.push('seller'); return { sent: ['Exportadora'], waiting: [] as string[] } })
  class InvalidTrackingNumberError extends Error {
    readonly status = 400
    constructor(message: string, readonly details: string) {
      super(message)
    }
  }
  return { log, writes, state, fakeDb, okMint, applyDecision, mintCertificates, evaluateSampleCompliance, evaluate, issued, writeback, seller, InvalidTrackingNumberError }
})
const { log, writes, state, applyDecision, mintCertificates, evaluateSampleCompliance, evaluate, issued, writeback, seller } = h

vi.mock('@/lib/cupping/finalize-pipeline', () => ({
  applyDecision: h.applyDecision,
  mintCertificates: h.mintCertificates,
  InvalidTrackingNumberError: h.InvalidTrackingNumberError,
}))
vi.mock('@/lib/compliance', () => ({ evaluateSampleCompliance: h.evaluateSampleCompliance }))
vi.mock('@/lib/tolerance/evaluate', () => ({ evaluateTolerance: h.evaluate }))
vi.mock('@/lib/tolerance/sample-limits', () => ({ computeIssuedValuesForSample: h.issued }))
vi.mock('@/lib/tolerance/comments', () => ({ prefillComments: () => ['Melhorar peneira 18 para no mínimo 30%.'] }))
vi.mock('@/lib/sample-group', () => ({ groupSampleIds: async () => ['lab-1', 'sib-1'] }))
vi.mock('@/lib/approval-notification/tolerance-seller-send', () => ({ sendSellerNoticeNow: h.seller }))
vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({ writeDecisionToShipmentSamples: h.writeback }))

import { approveWithinTolerance, everyClientOptedIn } from './auto-approve'

const db = h.fakeDb() as never
const input = {
  labId: 'lab-1',
  qualitySpecId: 'spec-1',
  clientId: 'c1',
  sampleCategory: null,
  trackingNumber: 'BR-000001/26',
  currentWorkflowStage: 'analysis',
  assignedCupperIds: [] as string[],
  userId: 'user-1',
}
const writeOrder = () => log.slice()
const samplesUpdates = () => writes.filter((w) => w.table === 'samples' && w.op === 'update').map((w) => w.payload)
const auditRow = () => writes.find((w) => w.table === 'sample_tolerance_approvals' && w.op === 'insert')?.payload
const deletes = () => log.filter((l) => l.startsWith('delete ')).map((l) => l.slice('delete '.length))
const optedIn = (ids: string[]) => { state.optedIn = ids }
const settingsError = (m: string) => { state.settingsError = m }
const samplesUpdateError = (m: string) => { state.samplesUpdateError = m }

describe('approveWithinTolerance', () => {
  beforeEach(() => {
    log.length = 0
    writes.length = 0
    state.optedIn = ['c1', 'c2']
    state.settingsError = null
    state.samplesUpdateError = null
    state.certsBefore = []
    state.certsNow = ['cert-1']
    state.certReads = 0
    state.membersError = null
    state.members = [
      { id: 'lab-1', client_id: 'c1', status: 'pending', approved_with_comments: false },
      { id: 'sib-1', client_id: 'c2', status: 'pending', approved_with_comments: false },
    ]
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const m of [applyDecision, mintCertificates, evaluateSampleCompliance, writeback, seller]) m.mockClear()
    mintCertificates.mockImplementation(async () => { log.push('mint'); return h.okMint() as any })
    evaluate.mockReturnValue({ offered: true, items: [{ metric: 'screen_18' }], blockedBy: [] })
    issued.mockResolvedValue({ ok: true, issued: { screen_percentages: { '18': 30 }, defects: null } })
    seller.mockImplementation(async () => { log.push('seller'); return { sent: ['Exportadora'], waiting: [] } })
  })

  it('everyClientOptedIn: all on is on; one off, a null client or none at all is off', () => {
    expect(everyClientOptedIn(['a', 'b'], new Set(['a', 'b']))).toBe(true)
    expect(everyClientOptedIn(['a', 'b'], new Set(['a']))).toBe(false)
    expect(everyClientOptedIn(['a', null], new Set(['a']))).toBe(false)
    expect(everyClientOptedIn([], new Set())).toBe(false)
  })

  it('approves: audit row, walk to review, mint, then one write with status, stage and flag together', async () => {
    const out = await approveWithinTolerance(db, input)
    expect(out.kind).toBe('approved')
    expect(writeOrder()).toEqual(['insert sample_tolerance_approvals', 'mint', 'update samples', 'writeback', 'seller'])
    expect(applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'pending' })
    expect(samplesUpdates()).toHaveLength(1)
    expect(samplesUpdates()[0]).toMatchObject({ status: 'approved', workflow_stage: 'certified', approved_with_comments: true })
    expect(mintCertificates.mock.calls[0][1]).toMatchObject({ decision: 'approved', isRejected: false, violations: [] })
  })

  it('writes the prefilled Portuguese comments and asks for the additional sample', async () => {
    await approveWithinTolerance(db, input)
    expect(auditRow()).toMatchObject({
      comments: ['Melhorar peneira 18 para no mínimo 30%.'],
      request_additional_sample: true,
      sample_id: 'lab-1',
      decided_by: 'user-1',
    })
  })

  it('judges with the assigned cuppers, so the 5% check and the gate read the same scores', async () => {
    await approveWithinTolerance(db, { ...input, assignedCupperIds: ['c1'] })
    expect(evaluateSampleCompliance.mock.calls[0][3]).toEqual(['c1'])
  })

  it.each([
    ['a client switched off', () => optedIn([])],
    ['not offered', () => evaluate.mockReturnValue({ offered: false, items: [], blockedBy: ['Cup'] })],
    ['issued values fail', () => issued.mockResolvedValue({ ok: false, reason: 'x' })],
  ])('%s: not applicable, nothing written', async (_n, arrange) => {
    arrange()
    expect((await approveWithinTolerance(db, input)).kind).toBe('not_applicable')
    expect(writes).toHaveLength(0)
  })

  it('an Other Sample is not applicable', async () => {
    expect((await approveWithinTolerance(db, { ...input, sampleCategory: 'other' })).kind).toBe('not_applicable')
  })

  it('settings unreadable: failed, not a rejection, nothing written', async () => {
    settingsError('boom')
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(writes).toHaveLength(0)
  })

  it('a member fails to mint: failed, new certificates and audit row removed, lot never approved, nobody told', async () => {
    mintCertificates.mockResolvedValue({
      certificate: null,
      group: {
        minted: ['lab-1'], revised: [], unchanged: [],
        failed: [{ sampleId: 'sib-1', error: 'x' }],
        certificates: { 'lab-1': { id: 'cert-1', certificate_number: 'SAK-1/26' } },
      },
    } as any)
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(samplesUpdates()).toHaveLength(0)
    expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals audit-1'])
    expect(writeback).not.toHaveBeenCalled()
    expect(seller).not.toHaveBeenCalled()
  })

  it('the decision write fails: failed, new certificates and audit row removed', async () => {
    samplesUpdateError('boom')
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals audit-1'])
  })

  it('undo releases the number of a new certificate before deleting it, and restores one that existed', async () => {
    state.certsBefore = [{ id: 'cert-old', is_rejected: true, approved: false, compliance_violations: ['x'], revision_number: 2 }]
    state.certsNow = ['cert-old', 'cert-1']
    samplesUpdateError('boom')
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    const voidAt = log.indexOf('void cert-1')
    const delAt = log.indexOf('delete certificates cert-1')
    expect(voidAt).toBeGreaterThan(-1)
    expect(delAt).toBeGreaterThan(voidAt)
    expect(log).not.toContain('void cert-old')
    expect(log).not.toContain('delete certificates cert-old')
    expect(log).toContain('restore certificates cert-old')
    const restore = writes.find((w) => w.table === 'certificates' && w.op === 'update')?.payload
    expect(restore).toEqual({ is_rejected: true, approved: false, compliance_violations: ['x'], revision_number: 2 })
  })

  it('mint throws after creating a row: failed, the row not in the snapshot is released and deleted', async () => {
    mintCertificates.mockImplementation(async () => { throw new Error('mid-mint') })
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(log.indexOf('void cert-1')).toBeGreaterThan(-1)
    expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals audit-1'])
    expect(samplesUpdates()).toHaveLength(0)
  })

  it('settings unreadable: the lot is walked to Review once', async () => {
    settingsError('boom')
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(applyDecision).toHaveBeenCalledTimes(1)
    expect(applyDecision.mock.calls[0][1]).toMatchObject({ decision: 'pending' })
    expect(writes).toHaveLength(0)
  })

  it('decision write fails: no second walk', async () => {
    samplesUpdateError('boom')
    await approveWithinTolerance(db, input)
    expect(applyDecision).toHaveBeenCalledTimes(1)
  })

  it('not applicable never walks the lot', async () => {
    optedIn([])
    expect((await approveWithinTolerance(db, input)).kind).toBe('not_applicable')
    expect(applyDecision).not.toHaveBeenCalled()
  })

  it('the sys write-back rejecting after the decision does not undo it', async () => {
    writeback.mockRejectedValueOnce(new Error('sys down'))
    const out = await approveWithinTolerance(db, input)
    expect(out).toMatchObject({ kind: 'approved', sellerEmail: { sent: [], waiting: [] } })
    expect(deletes()).toEqual([])
    expect(log.some((l) => l.startsWith('restore') || l.startsWith('void'))).toBe(false)
  })

  it('re-finalizing a lot already approved with comments approves again but does not email the seller twice', async () => {
    state.members = [
      { id: 'lab-1', client_id: 'c1', status: 'approved', approved_with_comments: true },
      { id: 'sib-1', client_id: 'c2', status: 'approved', approved_with_comments: true },
    ]
    const out = await approveWithinTolerance(db, input)
    expect(out).toMatchObject({ kind: 'approved', sellerEmail: { sent: [], waiting: [] } })
    expect(auditRow()).toBeDefined()
    expect(mintCertificates).toHaveBeenCalledTimes(1)
    expect(samplesUpdates()).toEqual([expect.objectContaining({ status: 'approved', approved_with_comments: true })])
    expect(writeback).toHaveBeenCalledTimes(1)
    expect(seller).not.toHaveBeenCalled()
  })

  it('a lot that was rejected before still gets the seller notice', async () => {
    state.members = [
      { id: 'lab-1', client_id: 'c1', status: 'rejected', approved_with_comments: false },
      { id: 'sib-1', client_id: 'c2', status: 'rejected', approved_with_comments: false },
    ]
    expect(await approveWithinTolerance(db, input)).toMatchObject({ kind: 'approved', sellerEmail: { sent: ['Exportadora'] } })
    expect(seller).toHaveBeenCalledTimes(1)
  })

  it('only part of the group approved with comments: the seller is still told', async () => {
    state.members[0] = { id: 'lab-1', client_id: 'c1', status: 'approved', approved_with_comments: true }
    await approveWithinTolerance(db, input)
    expect(seller).toHaveBeenCalledTimes(1)
  })

  it('an invalid tracking number at mint: undone, walked to Review, and the error says what to fix', async () => {
    mintCertificates.mockImplementation(async () => {
      throw new h.InvalidTrackingNumberError('Cannot generate certificate - sample has invalid tracking number', 'Please contact an administrator to fix the sample tracking number.')
    })
    const out = await approveWithinTolerance(db, input)
    expect(out).toEqual({
      kind: 'failed',
      error: 'Cannot generate certificate - sample has invalid tracking number. Please contact an administrator to fix the sample tracking number.',
    })
    expect(deletes()).toEqual(['certificates cert-1', 'sample_tolerance_approvals audit-1'])
    expect(applyDecision).toHaveBeenCalledTimes(1)
    expect(samplesUpdates()).toHaveLength(0)
  })

  it('returns every group member\'s certificate', async () => {
    expect(await approveWithinTolerance(db, input)).toMatchObject({
      kind: 'approved',
      certificates: { 'lab-1': { id: 'cert-1', certificate_number: 'SAK-1/26' } },
    })
  })

  it('the group read fails: failed, nothing written', async () => {
    state.membersError = 'boom'
    expect((await approveWithinTolerance(db, input)).kind).toBe('failed')
    expect(writes).toHaveLength(0)
    expect(seller).not.toHaveBeenCalled()
  })

  it('a seller who could not be emailed does not undo the approval', async () => {
    seller.mockResolvedValue({ sent: [], waiting: ['Exportadora'] })
    expect((await approveWithinTolerance(db, input)).kind).toBe('approved')
  })
})
