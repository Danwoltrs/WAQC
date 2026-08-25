import { describe, it, expect, vi } from 'vitest'
import { applyDecision, mintCertificates, InvalidTrackingNumberError } from './finalize-pipeline'

vi.mock('@/lib/approval-notification/sys-decision-writeback', () => ({
  writeDecisionToShipmentSamples: vi.fn(async () => undefined),
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
 *    caller must check `error` itself.
 *  - `throwOnUpdateWhen` rejects the awaited call outright, simulating a
 *    thrown/network-level failure rather than a resolved error.
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
      const filters: Array<{ col: string; value: unknown }> = []
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
        (opts.rows?.[table] ?? []).filter((row) => filters.every((f) => row[f.col] === f.value))
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
