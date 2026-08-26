import { describe, it, expect, vi } from 'vitest'
import {
  applyDecision,
  mintCertificates,
  closeSessionIfComplete,
  InvalidTrackingNumberError,
} from './finalize-pipeline'

vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
}))

vi.mock('@/lib/certificate-storage', () => ({
  invalidateCertificatePdf: vi.fn(async () => undefined),
}))

/**
 * Records every write issued per table and what it was filtered on, and serves
 * seeded rows back to reads so the certificate mint can be exercised end to end.
 *
 * The failure predicates simulate the distinct ways a real Supabase call can
 * fail, matching how supabase-js actually behaves:
 *  - `failUpdateWhen` / `failInsertWhen` resolve with a Postgres-shaped
 *    `{ error }` (the normal shape for a DB-level failure — RLS denial,
 *    constraint violation, missing column). The promise never rejects; the
 *    caller must check `error` itself. A caller that never inspects the
 *    resolved `error` (e.g. a fire-and-forget audit-log insert) will NOT
 *    observe this failure at all — it is indistinguishable from success.
 *  - `throwOnUpdateWhen` / `throwOnInsertWhen` reject the awaited call
 *    outright, simulating a thrown/network-level failure rather than a
 *    resolved error. This is the only predicate that can exercise a
 *    `try { await … } catch { … }` guard around a write whose result is
 *    otherwise never destructured.
 *
 * `rows` seeds what a SELECT returns, narrowed by the .eq()/.is() the query
 * used. An INSERT echoes its own values back with a generated id plus whatever
 * `assignOnInsert` adds — which is how certificates really behave: the row goes
 * in with certificate_number null and comes back numbered by the
 * assign_certificate_number trigger.
 */
function fakeDb(opts: {
  failUpdateWhen?: (table: string, values: Record<string, unknown>) => boolean
  throwOnUpdateWhen?: (table: string, values: Record<string, unknown>) => boolean
  failInsertWhen?: (table: string, values: Record<string, unknown>) => boolean
  throwOnInsertWhen?: (table: string, values: Record<string, unknown>) => boolean
  rows?: Record<string, Array<Record<string, unknown>>>
  assignOnInsert?: (table: string, values: Record<string, unknown>) => Record<string, unknown>
} = {}) {
  const writes: Array<{
    table: string
    op: 'insert' | 'update'
    values: Record<string, unknown>
    id?: string
  }> = []
  // Nothing in this pipeline may mint a certificate number itself — the number
  // is the sample's tracking number, assigned by a trigger. Recorded so a test
  // can prove no function call ever goes out.
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  let insertCount = 0
  const client = {
    writes,
    rpcCalls,
    rpc(fn: string, args?: unknown) {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: null, error: null })
    },
    from(table: string) {
      const filters: Array<{ col: string; value: unknown } | { col: string; values: unknown[] }> = []
      let pending: Record<string, unknown> | null = null
      let op: 'insert' | 'update' | null = null
      let id: string | undefined
      let recorded = false
      const record = () => {
        if (pending && op && !recorded) {
          recorded = true
          writes.push({ table, op, values: pending, id })
        }
      }
      const matching = () =>
        (opts.rows?.[table] ?? []).filter((row) =>
          filters.every((f) => ('values' in f ? f.values.includes(row[f.col]) : row[f.col] === f.value))
        )
      const settleWrite = () => {
        record()
        if (op === 'insert') {
          if (opts.failInsertWhen?.(table, pending!)) {
            return { data: null, error: { message: 'insert rejected', details: '', hint: '' } }
          }
          insertCount += 1
          return {
            data: {
              id: `${table}-${insertCount}`,
              ...pending,
              ...(opts.assignOnInsert?.(table, pending!) ?? {}),
            },
            error: null,
          }
        }
        if (opts.failUpdateWhen?.(table, pending!)) return { data: null, error: { message: 'db exploded' } }
        return { data: { ...(matching()[0] ?? {}), ...pending }, error: null }
      }
      const chain: any = {
        update(values: Record<string, unknown>) { pending = values; op = 'update'; return chain },
        insert(values: Record<string, unknown>) { pending = values; op = 'insert'; return chain },
        select() { return chain },
        eq(col: string, value: unknown) { filters.push({ col, value }); id = value as string; return chain },
        is(col: string, value: unknown) { filters.push({ col, value }); return chain },
        in(col: string, values: unknown[]) { filters.push({ col, values }); return chain },
        order() { return chain },
        single: async () => {
          if (op) return settleWrite()
          const [row] = matching()
          return row ? { data: row, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
        },
        maybeSingle: async () => {
          if (op) return settleWrite()
          return { data: matching()[0] ?? null, error: null }
        },
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          if (!op) return Promise.resolve({ data: matching(), error: null }).then(onFulfilled, onRejected)
          record()
          if (op === 'update' && opts.throwOnUpdateWhen?.(table, pending!)) {
            return Promise.reject(new Error('simulated write failure')).then(onFulfilled, onRejected)
          }
          if (op === 'insert' && opts.throwOnInsertWhen?.(table, pending!)) {
            return Promise.reject(new Error('simulated write failure')).then(onFulfilled, onRejected)
          }
          return Promise.resolve(settleWrite()).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
  return client
}

const base = {
  sampleId: 'smp-1',
  currentWorkflowStage: 'analysis',
  actorUserId: 'user-1',
  sellerComment: null,
}

describe('applyDecision', () => {
  it('walks an analysis-stage sample through review before certifying it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review', 'certified'])
  })

  it('marks a rejected sample rejected, not certified', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'rejected' })
    const last = db.writes.filter(w => w.table === 'samples').pop()
    expect(last!.values).toMatchObject({ workflow_stage: 'rejected', status: 'rejected' })
  })

  it('parks a pending sample in review and never certifies it', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review'])
  })

  it('does not re-enter review for a sample already there', async () => {
    const db = fakeDb()
    await applyDecision(db as any, { ...base, currentWorkflowStage: 'review', decision: 'approved' })
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['certified'])
  })

  it('persists a seller comment only on approval', async () => {
    const approved = fakeDb()
    await applyDecision(approved as any, { ...base, decision: 'approved', sellerComment: 'lovely cup' })
    expect(approved.writes.some(w => w.values.seller_comment === 'lovely cup')).toBe(true)

    const rejected = fakeDb()
    await applyDecision(rejected as any, { ...base, decision: 'rejected', sellerComment: 'lovely cup' })
    expect(rejected.writes.some(w => 'seller_comment' in w.values)).toBe(false)
  })

  it('pushes the decision to sys once the sample is resolved', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'approved' })
    expect(writeDecisionToShipmentSamples).toHaveBeenCalled()
  })

  it('does not push a pending decision to sys', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    vi.mocked(writeDecisionToShipmentSamples).mockClear()
    const db = fakeDb()
    await applyDecision(db as any, { ...base, decision: 'pending' })
    expect(writeDecisionToShipmentSamples).not.toHaveBeenCalled()
  })

  it('rejects, without minting a decision, when the review-transition write fails', async () => {
    const db = fakeDb({ failUpdateWhen: (table, values) => table === 'samples' && values.workflow_stage === 'review' })
    await expect(applyDecision(db as any, { ...base, decision: 'approved' })).rejects.toThrow(/review stage/i)
    // Never reached the certify/reject write — the sample is left exactly where it failed.
    const stages = db.writes.filter(w => w.table === 'samples').map(w => w.values.workflow_stage)
    expect(stages).toEqual(['review'])
  })

  it('rejects when the final certify/reject write fails', async () => {
    const db = fakeDb({
      failUpdateWhen: (table, values) => table === 'samples' && values.workflow_stage === 'certified',
    })
    await expect(
      applyDecision(db as any, { ...base, currentWorkflowStage: 'review', decision: 'approved' }),
    ).rejects.toThrow(/update sample status/i)
  })

  it('does not reject when the seller-comment write fails, and still reaches sys', async () => {
    const { writeDecisionToShipmentSamples } = await import('@/lib/approval-notification/sys-decision-writeback')
    vi.mocked(writeDecisionToShipmentSamples).mockClear()
    const db = fakeDb({ throwOnUpdateWhen: (table, values) => table === 'samples' && 'seller_comment' in values })
    await expect(
      applyDecision(db as any, {
        ...base,
        currentWorkflowStage: 'review',
        decision: 'approved',
        sellerComment: 'lovely cup',
      }),
    ).resolves.toBeUndefined()
    expect(writeDecisionToShipmentSamples).toHaveBeenCalled()
  })
})

const mintBase = {
  sample: { id: 'smp-1', client_id: 'cmp-1', sample_category: null },
  trackingNumber: 'SAN-1/26',
  isRejected: false,
  violations: [] as string[],
  actorUserId: 'user-1',
}

/** Simulates the assign_certificate_number trigger: the row goes in with a null
 *  number and comes back carrying the sample's tracking number. */
const numberedByTrigger = (table: string) =>
  table === 'certificates' ? { certificate_number: 'SAN-1/26' } : {}

const certInserts = (db: ReturnType<typeof fakeDb>) =>
  db.writes.filter(w => w.table === 'certificates' && w.op === 'insert')
const motherInserts = (db: ReturnType<typeof fakeDb>) =>
  certInserts(db).filter(w => !w.values.sample_contract_id)
const subInserts = (db: ReturnType<typeof fakeDb>) =>
  certInserts(db).filter(w => Boolean(w.values.sample_contract_id))

const twoSubContracts = {
  sample_contracts: [
    { id: 'sc-1', sample_id: 'smp-1', client_id: 'cmp-1', tracking_number: 'SAN-1/26', sort_order: 1 },
    { id: 'sc-2', sample_id: 'smp-1', client_id: 'cmp-2', tracking_number: 'SAN-2/26', sort_order: 2 },
  ],
  companies: [
    { id: 'cmp-1', name: 'Mother Co', fantasy_name: null },
    { id: 'cmp-2', name: 'Split Co Legal Name', fantasy_name: 'Split Co' },
  ],
}

describe('mintCertificates', () => {
  it('mints nothing for a pending decision', async () => {
    const db = fakeDb()
    const out = await mintCertificates(db as any, { ...mintBase, decision: 'pending' })
    expect(out.certificate).toBeNull()
    expect(db.writes.some(w => w.table === 'certificates')).toBe(false)
  })

  it('mints nothing for an Other Sample, which clients approve individually', async () => {
    const db = fakeDb({ rows: twoSubContracts })
    const out = await mintCertificates(db as any, {
      ...mintBase,
      sample: { ...mintBase.sample, sample_category: 'other' },
      decision: 'approved',
    })
    expect(out.certificate).toBeNull()
    // Neither the mother nor any split — an Other Sample gets no Wolthers number at all.
    expect(certInserts(db)).toEqual([])
  })

  it('mints one certificate for an approved lot and leaves the number to the database', async () => {
    const db = fakeDb({
      rows: { companies: [{ id: 'cmp-1', name: 'Mother Co', fantasy_name: 'Motherly' }] },
      assignOnInsert: numberedByTrigger,
    })
    const out = await mintCertificates(db as any, { ...mintBase, decision: 'approved' })

    expect(motherInserts(db)).toHaveLength(1)
    const values = motherInserts(db)[0].values
    // Inserted with a NULL number: the assign_certificate_number trigger reuses
    // the sample's tracking number. Nothing here computes a number.
    expect(values.certificate_number).toBeNull()
    // No sample_contract_id, or the existing-certificate short-circuit
    // (.is('sample_contract_id', null)) would never find this row again.
    expect('sample_contract_id' in values).toBe(false)
    expect(values).toMatchObject({
      sample_id: 'smp-1',
      issued_to: 'Motherly',
      issued_by: 'user-1',
      status: 'issued',
      is_rejected: false,
      compliance_violations: null,
    })
    expect(out.certificate?.certificate_number).toBe('SAN-1/26')
  })

  it('never asks the database to generate a second number', async () => {
    const db = fakeDb({ assignOnInsert: numberedByTrigger, rows: twoSubContracts })
    await mintCertificates(db as any, { ...mintBase, decision: 'approved' })
    expect(db.rpcCalls).toEqual([])
  })

  it('revises the existing certificate instead of minting a second number', async () => {
    const db = fakeDb({
      rows: {
        certificates: [{
          id: 'cert-existing',
          certificate_number: 'SAN-1/26',
          sample_id: 'smp-1',
          sample_contract_id: null,
          is_rejected: false,
          compliance_violations: null,
          revision_number: 2,
          approved: true,
        }],
      },
    })
    const out = await mintCertificates(db as any, {
      ...mintBase,
      decision: 'rejected',
      isRejected: true,
      violations: ['Moisture out of spec'],
    })

    // The failure this whole function exists to avoid: a second number.
    expect(certInserts(db)).toEqual([])
    expect(out.certificate?.id).toBe('cert-existing')
    expect(out.certificate?.certificate_number).toBe('SAN-1/26')

    const update = db.writes.find(w => w.table === 'certificates' && w.op === 'update')!
    expect(update.id).toBe('cert-existing')
    expect('certificate_number' in update.values).toBe(false)
    expect(update.values).toMatchObject({
      is_rejected: true,
      approved: false,
      compliance_violations: ['Moisture out of spec'],
      revision_number: 3,
      pdf_url: null,
    })
    expect(String(update.values.override_comment)).toContain('APPROVED to REJECTED')
    expect(String(update.values.override_comment)).toContain('New violations: Moisture out of spec')

    // Version history is written before the update, off the pre-update revision.
    const version = db.writes.find(w => w.table === 'certificate_versions')!
    expect(version.values).toMatchObject({ certificate_id: 'cert-existing', version_number: 2, created_by: 'user-1' })
  })

  it('keeps the certificate it read when the revision update fails', async () => {
    const db = fakeDb({
      failUpdateWhen: (table) => table === 'certificates',
      rows: {
        certificates: [{
          id: 'cert-existing',
          certificate_number: 'SAN-1/26',
          sample_id: 'smp-1',
          sample_contract_id: null,
          revision_number: 0,
        }],
      },
    })
    const out = await mintCertificates(db as any, { ...mintBase, decision: 'approved' })
    expect(out.certificate?.certificate_number).toBe('SAN-1/26')
    expect(certInserts(db)).toEqual([])
  })

  it('refuses to mint on a broken tracking number rather than issue an unidentifiable certificate', async () => {
    for (const broken of [null, '', 'null']) {
      const db = fakeDb()
      const err = await mintCertificates(db as any, {
        ...mintBase,
        trackingNumber: broken,
        decision: 'approved',
      }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(InvalidTrackingNumberError)
      expect((err as InvalidTrackingNumberError).status).toBe(400)
      expect((err as Error).message).toContain('invalid tracking number')
      expect((err as InvalidTrackingNumberError).details).toContain('administrator')
      expect(db.writes.some(w => w.table === 'certificates')).toBe(false)
    }
  })

  it('stamps the per-client validity window, and none at all when the client has no window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00Z'))
    try {
      const withWindow = fakeDb({
        rows: { qc_client_settings: [{ company_id: 'cmp-1', certificate_validity_months: 6 }] },
      })
      await mintCertificates(withWindow as any, { ...mintBase, decision: 'approved' })
      const values = motherInserts(withWindow)[0].values
      expect(values.valid_from).toBe('2026-08-25T12:00:00.000Z')
      expect(values.valid_until).toBe('2027-02-25T12:00:00.000Z')

      for (const months of [null, 0]) {
        const noWindow = fakeDb({
          rows: { qc_client_settings: [{ company_id: 'cmp-1', certificate_validity_months: months }] },
        })
        await mintCertificates(noWindow as any, { ...mintBase, decision: 'approved' })
        expect(motherInserts(noWindow)[0].values.valid_until).toBeNull()
      }

      // No settings row at all → no window either.
      const unconfigured = fakeDb()
      await mintCertificates(unconfigured as any, { ...mintBase, decision: 'approved' })
      expect(motherInserts(unconfigured)[0].values.valid_until).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('mints one certificate per sub-contract, each issued to its own client', async () => {
    const db = fakeDb({ rows: twoSubContracts, assignOnInsert: numberedByTrigger })
    await mintCertificates(db as any, { ...mintBase, decision: 'approved' })

    const subs = subInserts(db)
    expect(subs.map(w => w.values.sample_contract_id)).toEqual(['sc-1', 'sc-2'])
    // Same client as the mother → mother's name; different client → its own.
    expect(subs[0].values.issued_to).toBe('Mother Co')
    expect(subs[1].values.issued_to).toBe('Split Co')
    // Every split is numbered by the trigger too, never here.
    expect(subs.every(w => w.values.certificate_number === null)).toBe(true)
    expect(subs.every(w => w.values.is_rejected === false)).toBe(true)
  })

  it('carries a rejection onto the mother and every split', async () => {
    const db = fakeDb({ rows: twoSubContracts, assignOnInsert: numberedByTrigger })
    await mintCertificates(db as any, {
      ...mintBase,
      decision: 'rejected',
      isRejected: true,
      violations: ['Cup score below spec'],
    })
    expect(certInserts(db)).toHaveLength(3)
    expect(certInserts(db).every(w => w.values.is_rejected === true)).toBe(true)
    expect(certInserts(db).every(
      w => JSON.stringify(w.values.compliance_violations) === JSON.stringify(['Cup score below spec']),
    )).toBe(true)
  })

  it('does not mint a second certificate for a sub-contract that already has one', async () => {
    const db = fakeDb({
      rows: {
        ...twoSubContracts,
        certificates: [
          // A split's certificate — invisible to the mother lookup, which
          // filters sample_contract_id IS NULL.
          { id: 'cert-sub-1', sample_id: 'smp-1', sample_contract_id: 'sc-1' },
        ],
      },
      assignOnInsert: numberedByTrigger,
    })
    await mintCertificates(db as any, { ...mintBase, decision: 'approved' })
    expect(motherInserts(db)).toHaveLength(1)
    expect(subInserts(db).map(w => w.values.sample_contract_id)).toEqual(['sc-2'])
  })

  it('mints no split certificates when the mother certificate failed', async () => {
    const db = fakeDb({
      rows: twoSubContracts,
      failInsertWhen: (table, values) => table === 'certificates' && !values.sample_contract_id,
    })
    const out = await mintCertificates(db as any, { ...mintBase, decision: 'approved' })
    expect(out.certificate).toBeNull()
    expect(subInserts(db)).toEqual([])
  })

  it('keeps the mother certificate when a split certificate fails', async () => {
    const db = fakeDb({
      rows: twoSubContracts,
      assignOnInsert: numberedByTrigger,
      failInsertWhen: (table, values) => table === 'certificates' && Boolean(values.sample_contract_id),
    })
    const out = await mintCertificates(db as any, { ...mintBase, decision: 'approved' })
    expect(out.certificate?.certificate_number).toBe('SAN-1/26')
    // Both splits were still attempted — one failure must not skip the rest.
    expect(subInserts(db)).toHaveLength(2)
  })
})

const closeBase = {
  session: { id: 'sess-1', sample_ids: ['s1'], master_cupper_id: null as string | null, laboratory_id: 'lab-1' as string | null },
  sampleId: 's1',
  validatedByCupperId: 'c1' as string | null,
  actorId: 'user-1',
  decision: 'approved' as const,
  notes: null as string | null,
}

const sessionWrites = (db: ReturnType<typeof fakeDb>) => db.writes.filter(w => w.table === 'cupping_sessions')

describe('closeSessionIfComplete', () => {
  describe('master-cupper backfill', () => {
    it('backfills the validating cupper as master when none was designated', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      expect(sessionWrites(db).some(w => w.values.master_cupper_id === 'c1')).toBe(true)
    })

    it('leaves a designated master cupper alone', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, {
        ...closeBase,
        session: { ...closeBase.session, master_cupper_id: 'boss' },
      })
      expect(sessionWrites(db).some(w => 'master_cupper_id' in w.values)).toBe(false)
    })

    it('does not backfill when nobody validated the sample either', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase, validatedByCupperId: null })
      expect(sessionWrites(db).some(w => 'master_cupper_id' in w.values)).toBe(false)
    })
  })

  // The condition deciding whether the session closes: the inline code only ever
  // inspected the OTHER samples in the session (never this sample's own outcome),
  // so a single-sample session has nothing to inspect and starts (and stays) at
  // its `allFinalized = true` default. Preserved verbatim — see the two "quirk"
  // tests below, which lock in that exact pre-existing shape rather than the
  // "obviously correct" behaviour a careless re-implementation would produce.
  describe('session completion', () => {
    it('closes a single-sample session once its only sample resolves', async () => {
      const db = fakeDb()
      const out = await closeSessionIfComplete(db as any, { ...closeBase })
      expect(out.allFinalized).toBe(true)
      expect(sessionWrites(db).some(w => w.values.status === 'completed')).toBe(true)
    })

    it('quirk preserved verbatim: a single-sample session closes even while THIS sample is still pending grading', async () => {
      const db = fakeDb()
      const out = await closeSessionIfComplete(db as any, { ...closeBase, decision: 'pending' })
      expect(out.allFinalized).toBe(true)
      expect(sessionWrites(db).some(w => w.values.status === 'completed')).toBe(true)
    })

    it('keeps the session open while another sample in it is still in review', async () => {
      const db = fakeDb({ rows: { samples: [{ id: 's2', workflow_stage: 'review' }] } })
      const out = await closeSessionIfComplete(db as any, {
        ...closeBase,
        session: { ...closeBase.session, sample_ids: ['s1', 's2'] },
      })
      expect(out.allFinalized).toBe(false)
      expect(sessionWrites(db).some(w => 'status' in w.values)).toBe(false)
    })

    it('closes the session once every OTHER sample is certified or rejected', async () => {
      const db = fakeDb({
        rows: { samples: [
          { id: 's2', workflow_stage: 'certified' },
          { id: 's3', workflow_stage: 'rejected' },
        ] },
      })
      const out = await closeSessionIfComplete(db as any, {
        ...closeBase,
        session: { ...closeBase.session, sample_ids: ['s1', 's2', 's3'] },
      })
      expect(out.allFinalized).toBe(true)
      expect(sessionWrites(db).some(w => w.values.status === 'completed')).toBe(true)
    })

    it('quirk preserved verbatim: closes once every OTHER sample resolves even though THIS one is still pending', async () => {
      const db = fakeDb({ rows: { samples: [{ id: 's2', workflow_stage: 'certified' }] } })
      const out = await closeSessionIfComplete(db as any, {
        ...closeBase,
        decision: 'pending',
        session: { ...closeBase.session, sample_ids: ['s1', 's2'] },
      })
      expect(out.allFinalized).toBe(true)
    })

    // Regression: the close wrote `completed_at`, a column cupping_sessions has
    // never had, so every close failed with 42703 and no session ever reached
    // 'completed'. It hid for months because the error is only logged and the
    // fake db below accepts any column name. Pinning the exact column set is
    // the only thing here that can catch that class of drift.
    it('writes only columns that exist on cupping_sessions', async () => {
      const CUPPING_SESSION_COLUMNS = new Set([
        'allow_single_cupper', 'auto_averaged', 'created_at', 'created_by', 'cup_count',
        'cup_pattern', 'cupper_completion', 'cupper_ids', 'discrepancy_detected',
        'discrepancy_notes', 'finalized_at', 'finalized_by', 'id', 'laboratory_id',
        'master_cupper_id', 'min_cuppers_required', 'participants', 'review_required',
        'sample_ids', 'session_date', 'session_type', 'status', 'updated_at',
        'validated_at', 'validated_by', 'validation_notes',
      ])
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      const written = sessionWrites(db).flatMap(w => Object.keys(w.values))
      expect(written.length).toBeGreaterThan(0)
      expect(written.filter(c => !CUPPING_SESSION_COLUMNS.has(c))).toEqual([])
    })

    it('stamps finalized_at and finalized_by when it closes the session', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      const close = sessionWrites(db).find(w => w.values.status === 'completed')!
      expect(close.values.finalized_at).toEqual(expect.any(String))
      expect(close.values.finalized_by).toBe('user-1')
      expect(close.values).not.toHaveProperty('completed_at')
    })

    it('never touches session status while the session stays open, but still backfills the master cupper', async () => {
      const db = fakeDb({ rows: { samples: [{ id: 's2', workflow_stage: 'review' }] } })
      await closeSessionIfComplete(db as any, {
        ...closeBase,
        session: { ...closeBase.session, sample_ids: ['s1', 's2'] },
      })
      expect(sessionWrites(db).some(w => w.values.master_cupper_id === 'c1')).toBe(true)
      expect(sessionWrites(db).every(w => !('status' in w.values))).toBe(true)
    })
  })

  describe('audit trail', () => {
    it('writes the audit entry with the resolved cupper, decision, and the route defaults', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      const audit = db.writes.find(w => w.table === 'cupping_audit_log')!
      expect(audit.values).toMatchObject({
        session_id: 'sess-1',
        sample_id: 's1',
        action: 'finalized',
        performed_by: 'user-1',
        laboratory_id: 'lab-1',
      })
      const details = audit.values.details as Record<string, unknown>
      expect(details).toMatchObject({
        decision: 'approved',
        notes: null,
        violations: [],
        auto_determined: true,
        manual_decision: false,
      })
      // No certificate was minted — matches `certificate?.certificate_number` on a null certificate.
      expect(details.certificate_number).toBeUndefined()
      expect(typeof details.finalized_at).toBe('string')
    })

    it('stamps the certificate number, violations and manual-decision flag when the route provides them', async () => {
      const db = fakeDb()
      await closeSessionIfComplete(db as any, {
        ...closeBase,
        decision: 'rejected',
        notes: 'smells off',
        certificateNumber: 'SAN-1/26',
        violations: ['Moisture out of spec'],
        isManualDecision: true,
      })
      const audit = db.writes.find(w => w.table === 'cupping_audit_log')!
      const details = audit.values.details as Record<string, unknown>
      expect(details).toMatchObject({
        decision: 'rejected',
        notes: 'smells off',
        certificate_number: 'SAN-1/26',
        violations: ['Moisture out of spec'],
        auto_determined: false,
        manual_decision: true,
      })
    })

    it('does not fail finalize when the audit-log insert resolves with a Postgres-shaped error', async () => {
      // The code never destructures `error` off this insert, so a resolved
      // `{ error }` is invisible to it either way — this only proves a
      // resolved-with-error insert doesn't crash something downstream. It does
      // NOT exercise the try/catch (nothing here ever rejects); see the next
      // test for that.
      const db = fakeDb({ failInsertWhen: (table) => table === 'cupping_audit_log' })
      await expect(closeSessionIfComplete(db as any, { ...closeBase })).resolves.toBeDefined()
    })

    it('does not fail finalize when the audit-log insert throws — the catch this function relies on', async () => {
      const db = fakeDb({ throwOnInsertWhen: (table) => table === 'cupping_audit_log' })
      await expect(closeSessionIfComplete(db as any, { ...closeBase })).resolves.toBeDefined()
      // The write was attempted (and recorded) before the simulated rejection.
      expect(db.writes.some(w => w.table === 'cupping_audit_log')).toBe(true)
    })
  })

  describe('certificate PDF invalidation', () => {
    it('invalidates the certificate PDF cache for this sample', async () => {
      const { invalidateCertificatePdf } = await import('@/lib/certificate-storage')
      vi.mocked(invalidateCertificatePdf).mockClear()
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      expect(invalidateCertificatePdf).toHaveBeenCalledWith(db, 's1')
    })

    it('awaits certificate-PDF invalidation before returning, so a client refetch can never race it', async () => {
      const { invalidateCertificatePdf } = await import('@/lib/certificate-storage')
      let invalidated = false
      vi.mocked(invalidateCertificatePdf).mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        invalidated = true
      })
      const db = fakeDb()
      await closeSessionIfComplete(db as any, { ...closeBase })
      expect(invalidated).toBe(true)
    })

    it('does not fail finalize when certificate-PDF invalidation throws', async () => {
      const { invalidateCertificatePdf } = await import('@/lib/certificate-storage')
      vi.mocked(invalidateCertificatePdf).mockRejectedValueOnce(new Error('storage down'))
      const db = fakeDb()
      await expect(closeSessionIfComplete(db as any, { ...closeBase })).resolves.toBeDefined()
    })
  })
})
