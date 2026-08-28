import { describe, it, expect, vi } from 'vitest'
import {
  mintGroupCertificates,
  applyDecisionToGroup,
  resolveValidityWindow,
} from './certificate-mint'

type Row = Record<string, any>
type Filter =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'in'; col: string; values: unknown[] }
  | { kind: 'or'; clauses: Array<{ col: string; value: string }> }

/**
 * PostgREST stand-in, the same shape as the one in finalize-pipeline.test.ts
 * plus the `id.eq.X,lab_source_sample_id.eq.X` .or() that fetchGroup uses.
 * Seeded rows serve reads narrowed by .eq/.is/.in/.or; every write is recorded
 * with its filters so a test can assert exactly which ids it touched. An
 * INSERT echoes its values back with a generated id plus whatever
 * `assignOnInsert` adds — how certificates behave for real: the row goes in
 * with a null number and comes back numbered by the trigger.
 */
function fakeDb(opts: {
  rows?: Record<string, Row[]>
  failInsertWhen?: (table: string, values: Row) => boolean
  failUpdateWhen?: (table: string, values: Row) => boolean
  assignOnInsert?: (table: string, values: Row) => Row
} = {}) {
  const writes: Array<{ table: string; op: 'insert' | 'update'; values: Row; filters: Filter[] }> = []
  let insertCount = 0
  return {
    writes,
    from(table: string): any {
      const filters: Filter[] = []
      let pending: Row | null = null
      let op: 'insert' | 'update' | null = null
      const matches = (row: Row) =>
        filters.every((f) => {
          if (f.kind === 'eq') return row[f.col] === f.value
          if (f.kind === 'in') return f.values.includes(row[f.col])
          return f.clauses.some((c) => row[c.col] === c.value)
        })
      const matching = () => (opts.rows?.[table] ?? []).filter(matches)
      const settleWrite = () => {
        writes.push({ table, op: op!, values: pending!, filters: [...filters] })
        if (op === 'insert') {
          if (opts.failInsertWhen?.(table, pending!)) {
            return { data: null, error: { message: 'insert rejected', details: '', hint: '' } }
          }
          insertCount += 1
          return {
            data: { id: `${table}-${insertCount}`, ...pending, ...(opts.assignOnInsert?.(table, pending!) ?? {}) },
            error: null,
          }
        }
        if (opts.failUpdateWhen?.(table, pending!)) return { data: null, error: { message: 'db exploded' } }
        return { data: { ...(matching()[0] ?? {}), ...pending }, error: null }
      }
      const chain: any = {
        select() { return chain },
        insert(values: Row) { pending = values; op = 'insert'; return chain },
        update(values: Row) { pending = values; op = 'update'; return chain },
        eq(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        is(col: string, value: unknown) { filters.push({ kind: 'eq', col, value }); return chain },
        in(col: string, values: unknown[]) { filters.push({ kind: 'in', col, values }); return chain },
        or(expr: string) {
          const clauses = expr.split(',').map((part) => {
            const [col, , ...rest] = part.split('.')
            return { col, value: rest.join('.') }
          })
          filters.push({ kind: 'or', clauses })
          return chain
        },
        order() { return chain },
        limit() { return chain },
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
          const out = op ? settleWrite() : { data: matching(), error: null }
          return Promise.resolve(out).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  }
}

/** Simulates assign_certificate_number: in with a null number, out with one. */
const numberedByTrigger = (table: string, values: Row) =>
  table === 'certificates' ? { certificate_number: `CERT-${values.sample_id}` } : {}

/**
 * A lab unit and two siblings, seeded OUT of contract order so the tests can
 * prove the mint follows contract_ordinal (the number series must follow
 * contract order). sib-2 has no client of its own → issued to the lab unit's.
 */
const group = {
  samples: [
    { id: 'lab', lab_source_sample_id: null, contract_ordinal: 1, client_id: 'cmp-1', tracking_number: 'SAN-1/26', created_at: '2026-01-01' },
    { id: 'sib-3', lab_source_sample_id: 'lab', contract_ordinal: 3, client_id: 'cmp-2', tracking_number: 'SAN-3/26', created_at: '2026-01-02' },
    { id: 'sib-2', lab_source_sample_id: 'lab', contract_ordinal: 2, client_id: null, tracking_number: 'SAN-2/26', created_at: '2026-01-03' },
  ],
  companies: [
    { id: 'cmp-1', name: 'Mother Co', fantasy_name: null },
    { id: 'cmp-2', name: 'Split Co Legal Name', fantasy_name: 'Split Co' },
  ],
}

const base = {
  issuedBy: 'user-1',
  isRejected: false,
  validFrom: '2026-08-28T12:00:00.000Z',
  validUntil: '2027-02-28T12:00:00.000Z',
}

const certInserts = (db: ReturnType<typeof fakeDb>) =>
  db.writes.filter((w) => w.table === 'certificates' && w.op === 'insert')
const certUpdates = (db: ReturnType<typeof fakeDb>) =>
  db.writes.filter((w) => w.table === 'certificates' && w.op === 'update')

describe('mintGroupCertificates', () => {
  it('mints one certificate per group member in contract order, each issued to its own client', async () => {
    const db = fakeDb({ rows: group, assignOnInsert: numberedByTrigger })
    const out = await mintGroupCertificates(db as any, 'lab', base)

    // Lab unit first, then ordinal 2, then 3 — NOT the seeded order.
    expect(certInserts(db).map((w) => w.values.sample_id)).toEqual(['lab', 'sib-2', 'sib-3'])
    expect(out.minted).toEqual(['lab', 'sib-2', 'sib-3'])
    expect(out.revised).toEqual([])
    expect(out.failed).toEqual([])

    // Own client (fantasy name first); a member without one falls back to the lab unit's.
    expect(certInserts(db).map((w) => w.values.issued_to)).toEqual(['Mother Co', 'Mother Co', 'Split Co'])

    // Numbers are never computed here — every row goes in null and the
    // trigger fills it. No sample_contract_id is ever written again.
    for (const w of certInserts(db)) {
      expect(w.values.certificate_number).toBeNull()
      expect('sample_contract_id' in w.values).toBe(false)
      expect(w.values).toMatchObject({
        issued_by: 'user-1',
        status: 'issued',
        valid_from: base.validFrom,
        valid_until: base.validUntil,
        is_rejected: false,
        compliance_violations: null,
      })
    }
    expect(out.certificates['sib-3']?.certificate_number).toBe('CERT-sib-3')
  })

  it('resolves the whole group from any member', async () => {
    const db = fakeDb({ rows: group, assignOnInsert: numberedByTrigger })
    const out = await mintGroupCertificates(db as any, 'sib-3', base)
    expect(out.minted).toEqual(['lab', 'sib-2', 'sib-3'])
  })

  it('revises a member that already has a certificate instead of minting a second number', async () => {
    const db = fakeDb({
      rows: {
        ...group,
        certificates: [{
          id: 'cert-sib-2', sample_id: 'sib-2', certificate_number: 'OLD-2', is_rejected: false,
          compliance_violations: null, revision_number: 2, approved: true,
        }],
      },
      assignOnInsert: numberedByTrigger,
    })
    const out = await mintGroupCertificates(db as any, 'lab', {
      ...base,
      isRejected: true,
      violations: ['Moisture out of spec'],
    })

    expect(out.minted).toEqual(['lab', 'sib-3'])
    expect(out.revised).toEqual(['sib-2'])
    expect(certInserts(db).map((w) => w.values.sample_id)).toEqual(['lab', 'sib-3'])
    expect(out.certificates['sib-2']?.certificate_number).toBe('OLD-2')

    const update = certUpdates(db)[0]
    expect(update.filters).toEqual([{ kind: 'eq', col: 'id', value: 'cert-sib-2' }])
    expect('certificate_number' in update.values).toBe(false)
    // Bookkeeping never lands in override_comment — that field prints on the
    // customer's certificate under COMMENTS.
    expect('override_comment' in update.values).toBe(false)
    expect(update.values).toMatchObject({
      is_rejected: true, approved: false, compliance_violations: ['Moisture out of spec'],
      revision_number: 3, pdf_url: null,
    })
    const version = db.writes.find((w) => w.table === 'certificate_versions')!
    expect(version.values).toMatchObject({ certificate_id: 'cert-sib-2', version_number: 2, created_by: 'user-1' })
    expect(String(version.values.changes_description)).toContain('APPROVED to REJECTED')
    expect(String(version.values.changes_description)).toContain('New violations: Moisture out of spec')
  })

  it('keeps the certificate it read, and reports the failure, when the revision update fails', async () => {
    const db = fakeDb({
      rows: {
        ...group,
        certificates: [{ id: 'cert-lab', sample_id: 'lab', certificate_number: 'SAN-1/26', revision_number: 0 }],
      },
      failUpdateWhen: (table) => table === 'certificates',
      assignOnInsert: numberedByTrigger,
    })
    const out = await mintGroupCertificates(db as any, 'lab', base)
    expect(out.certificates['lab']?.certificate_number).toBe('SAN-1/26')
    expect(out.failed).toEqual([{ sampleId: 'lab', error: 'db exploded' }])
    // The siblings were still minted.
    expect(out.minted).toEqual(['sib-2', 'sib-3'])
  })

  it('leaves an existing certificate alone when asked not to revise', async () => {
    const db = fakeDb({
      rows: {
        ...group,
        certificates: [{ id: 'cert-lab', sample_id: 'lab', certificate_number: 'SAN-1/26', revision_number: 1 }],
      },
      assignOnInsert: numberedByTrigger,
    })
    const out = await mintGroupCertificates(db as any, 'lab', { ...base, reviseExisting: false })
    expect(out.unchanged).toEqual(['lab'])
    expect(out.minted).toEqual(['sib-2', 'sib-3'])
    expect(certUpdates(db)).toEqual([])
    expect(db.writes.some((w) => w.table === 'certificate_versions')).toBe(false)
    expect(out.certificates['lab']?.id).toBe('cert-lab')
  })

  it('reports an insert failure on one sibling and still mints the others', async () => {
    const db = fakeDb({
      rows: group,
      assignOnInsert: numberedByTrigger,
      failInsertWhen: (table, values) => table === 'certificates' && values.sample_id === 'sib-2',
    })
    const out = await mintGroupCertificates(db as any, 'lab', base)
    expect(out.failed).toEqual([{ sampleId: 'sib-2', error: 'insert rejected' }])
    expect(out.minted).toEqual(['lab', 'sib-3'])
    // All three were attempted.
    expect(certInserts(db)).toHaveLength(3)
    expect(out.certificates['sib-2']).toBeUndefined()
  })

  it('carries a rejection and its violations onto every member', async () => {
    const db = fakeDb({ rows: group, assignOnInsert: numberedByTrigger })
    await mintGroupCertificates(db as any, 'lab', { ...base, isRejected: true, violations: ['Cup score below spec'] })
    expect(certInserts(db)).toHaveLength(3)
    expect(certInserts(db).every((w) => w.values.is_rejected === true)).toBe(true)
    expect(certInserts(db).every(
      (w) => JSON.stringify(w.values.compliance_violations) === JSON.stringify(['Cup score below spec']),
    )).toBe(true)
  })

  it('stamps an override comment on a fresh certificate only', async () => {
    const db = fakeDb({
      rows: {
        ...group,
        certificates: [{ id: 'cert-lab', sample_id: 'lab', certificate_number: 'SAN-1/26', revision_number: 0, override_comment: 'kept' }],
      },
      assignOnInsert: numberedByTrigger,
    })
    await mintGroupCertificates(db as any, 'lab', { ...base, overrideComment: 'Approved on re-cup' })
    expect(certInserts(db).every((w) => w.values.override_comment === 'Approved on re-cup')).toBe(true)
    expect('override_comment' in certUpdates(db)[0].values).toBe(false)
  })

  it('restricts the mint to the requested members', async () => {
    const db = fakeDb({ rows: group, assignOnInsert: numberedByTrigger })
    const out = await mintGroupCertificates(db as any, 'lab', { ...base, onlySampleIds: ['sib-3'] })
    expect(out.minted).toEqual(['sib-3'])
    expect(certInserts(db)).toHaveLength(1)
  })

  it('mints nothing for a sample that does not exist', async () => {
    const db = fakeDb({ rows: group })
    const out = await mintGroupCertificates(db as any, 'ghost', base)
    expect(out).toEqual({ minted: [], revised: [], unchanged: [], failed: [], certificates: {} })
    expect(db.writes).toEqual([])
  })
})

describe('applyDecisionToGroup', () => {
  it('updates every member of the group in one write, lab unit first', async () => {
    const db = fakeDb({ rows: group })
    const out = await applyDecisionToGroup(db as any, 'sib-2', { status: 'approved', workflow_stage: 'certified' })
    expect(out.ids).toEqual(['lab', 'sib-2', 'sib-3'])
    expect(out.error).toBeNull()
    const [write] = db.writes
    expect(write.table).toBe('samples')
    expect(write.filters).toEqual([{ kind: 'in', col: 'id', values: ['lab', 'sib-2', 'sib-3'] }])
    expect(write.values).toMatchObject({ status: 'approved', workflow_stage: 'certified' })
    expect(typeof write.values.updated_at).toBe('string')
  })

  it('falls back to the sample itself when it is unknown, so a plain update still happens', async () => {
    const db = fakeDb()
    const out = await applyDecisionToGroup(db as any, 'solo', { workflow_stage: 'review' })
    expect(out.ids).toEqual(['solo'])
    expect(db.writes[0].filters).toEqual([{ kind: 'in', col: 'id', values: ['solo'] }])
  })

  it('surfaces the database error instead of throwing', async () => {
    const db = fakeDb({ rows: group, failUpdateWhen: (table) => table === 'samples' })
    const out = await applyDecisionToGroup(db as any, 'lab', { status: 'rejected', workflow_stage: 'rejected' })
    expect(out.error?.message).toBe('db exploded')
  })
})

describe('resolveValidityWindow', () => {
  it('adds the client validity months, and none at all without a window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00Z'))
    try {
      const withWindow = fakeDb({ rows: { qc_client_settings: [{ company_id: 'cmp-1', certificate_validity_months: 6 }] } })
      expect(await resolveValidityWindow(withWindow as any, 'cmp-1')).toEqual({
        validFrom: '2026-08-25T12:00:00.000Z',
        validUntil: '2027-02-25T12:00:00.000Z',
      })
      for (const months of [null, 0]) {
        const noWindow = fakeDb({ rows: { qc_client_settings: [{ company_id: 'cmp-1', certificate_validity_months: months }] } })
        expect((await resolveValidityWindow(noWindow as any, 'cmp-1')).validUntil).toBeNull()
      }
      expect((await resolveValidityWindow(fakeDb() as any, 'cmp-1')).validUntil).toBeNull()
      expect((await resolveValidityWindow(fakeDb() as any, null)).validUntil).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
