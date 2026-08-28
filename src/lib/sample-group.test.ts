import { describe, it, expect } from 'vitest'
import {
  labSourceId, isLabUnit, sortGroup, buildSiblingRow, createSiblingSamples,
  MOTHER_SHARED_FIELDS, SIBLING_OWN_FIELDS, SIBLING_COALESCE_FIELDS,
  type GroupMember,
} from './sample-group'

const mother = {
  id: 'm', tracking_number: 'SAN-00654/26', origin: 'BR', sample_category: 'quality_control', sample_type: 'pss',
  laboratory_id: 'lab', quality_spec_id: 'q', client_id: 'dunkin', seller_id: 'ofi', exporter_id: 'ofi',
  status: 'approved', workflow_stage: 'certified', crop_year: '26/27', processing_method: 'natural',
  certifications: ['RFA'], seller_contract_nr: 'S664243-13', shipper_contract_nr: null, exporter_contract_nr: 'EX-1',
  exporter_sample_number: '130306', ico_number: null, container_nr: null, shipment_month: '2026-10',
  bag_count: 333, bag_weight_kg: 60, bag_type: 'jute_bag', bags_quantity_mt: 19.98, equivalent_60kg_bags: 333, bags: null,
  importer_id: 'imp', roaster_id: null, end_client_id: null, importer_is_qc_client: false,
  wolthers_contract_nr: 'W-1', buyer_contract_nr: 'S049504-13', storage_position: 'A1', deleted_at: null,
  linked_pss_sample_id: 'x', linked_pss_sample_contract_id: 'y', split_numbering: true, created_at: '2026-08-27T17:52:33Z',
  manual_ref_fields: ['buyer_contract_nr'], contract_id: 'sysc',
}

describe('labSourceId / isLabUnit', () => {
  it('is the row itself for a lab unit and the pointer for a sibling', () => {
    expect(labSourceId({ id: 'a', lab_source_sample_id: null })).toBe('a')
    expect(labSourceId({ id: 'b', lab_source_sample_id: 'a' })).toBe('a')
    expect(isLabUnit({ id: 'a', lab_source_sample_id: null })).toBe(true)
    expect(isLabUnit({ id: 'b', lab_source_sample_id: 'a' })).toBe(false)
  })
})

describe('sortGroup', () => {
  it('puts the lab unit first, then contract order, then creation time', () => {
    const rows = [
      { id: 's3', lab_source_sample_id: 'm', contract_ordinal: null, created_at: '2026-01-03' },
      { id: 's2', lab_source_sample_id: 'm', contract_ordinal: 3, created_at: '2026-01-02' },
      { id: 'm', lab_source_sample_id: null, contract_ordinal: 1, created_at: '2026-01-01' },
      { id: 's1', lab_source_sample_id: 'm', contract_ordinal: 2, created_at: '2026-01-05' },
    ]
    expect(sortGroup(rows).map((r) => r.id)).toEqual(['m', 's1', 's2', 's3'])
  })
})

describe('buildSiblingRow', () => {
  it("copies the lab unit, takes the contract's own buy side and refs, and cross-maps the seller ref", () => {
    const row = buildSiblingRow(mother, {
      importer_id: 'imp2', importer_is_qc_client: true, buyer_contract_nr: 'S049504-14',
      supplier_contract_nr: 'S664243-14', exporter_sample_number: '130307',
      bag_count: 20, bag_weight_kg: 1000, bag_type: 'big_bag', bags_quantity_mt: 20, equivalent_60kg_bags: 333,
      created_at: '2026-08-28T10:00:00Z',
    }, { trackingNumber: 'SAN-00700/26', ordinal: 2 })
    expect(row.id).toBeUndefined()
    expect(row.tracking_number).toBe('SAN-00700/26')
    expect(row.lab_source_sample_id).toBe('m')
    expect(row.contract_ordinal).toBe(2)
    expect(row.split_numbering).toBe(true)
    expect(row.origin).toBe('BR'); expect(row.laboratory_id).toBe('lab'); expect(row.status).toBe('approved')
    expect(row.workflow_stage).toBe('certified'); expect(row.certifications).toEqual(['RFA'])
    expect(row.seller_id).toBe('ofi'); expect(row.exporter_contract_nr).toBe('EX-1')
    expect(row.importer_id).toBe('imp2'); expect(row.roaster_id).toBeNull(); expect(row.end_client_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true)
    expect(row.wolthers_contract_nr).toBeNull(); expect(row.buyer_contract_nr).toBe('S049504-14')
    expect(row.client_id).toBe('dunkin'); expect(row.exporter_sample_number).toBe('130307')
    expect(row.shipment_month).toBe('2026-10'); expect(row.supplier_contract_nr).toBe('S664243-14')
    expect(row.seller_contract_nr).toBe('S664243-14')
    expect(row.bag_count).toBe(20); expect(row.bag_type).toBe('big_bag'); expect(row.bags_quantity_mt).toBe(20)
    expect(row.bags).toBe(20)
    expect(row.storage_position).toBeNull(); expect(row.linked_pss_sample_id).toBeNull()
    expect(row.linked_pss_sample_contract_id).toBeNull()
    expect(row.manual_ref_fields).toEqual([]); expect(row.contract_id).toBeNull()
    expect(row.created_at).toBe('2026-08-28T10:00:00Z')
    expect(row.calculated_client_fee).toBeUndefined(); expect(row.updated_at).toBeUndefined()
  })

  it('falls back to the lab unit for blank coalesced fields and quantity', () => {
    const row = buildSiblingRow(mother, {}, { trackingNumber: 'SAN-00701/26', ordinal: 3 })
    expect(row.seller_contract_nr).toBe('S664243-13')
    expect(row.exporter_sample_number).toBe('130306')
    expect(row.bag_count).toBe(333); expect(row.bags_quantity_mt).toBe(19.98); expect(row.bag_type).toBe('jute_bag')
    expect(row.client_id).toBe('dunkin')
    expect(row.importer_id).toBeNull()
    expect(row.importer_is_qc_client).toBe(true)
    expect(row.created_at).toBeUndefined()
  })

  it('keeps the three field lists disjoint and complete', () => {
    const all = new Set([...MOTHER_SHARED_FIELDS, ...SIBLING_OWN_FIELDS, ...SIBLING_COALESCE_FIELDS])
    expect(all.size).toBe(MOTHER_SHARED_FIELDS.length + SIBLING_OWN_FIELDS.length + SIBLING_COALESCE_FIELDS.length)
    for (const f of ['bag_count', 'bags_quantity_mt', 'client_id', 'exporter_sample_number']) expect(SIBLING_COALESCE_FIELDS).toContain(f)
    for (const f of ['importer_id', 'buyer_contract_nr', 'wolthers_contract_nr', 'contract_id', 'manual_ref_fields']) expect(SIBLING_OWN_FIELDS).toContain(f)
    for (const f of ['origin', 'laboratory_id', 'status', 'workflow_stage', 'quality_spec_id', 'seller_id', 'deleted_at']) expect(MOTHER_SHARED_FIELDS).toContain(f)
  })
})

// ---------------------------------------------------------------------------
// createSiblingSamples
// ---------------------------------------------------------------------------

type Row = Record<string, any>
type Filter =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'in'; col: string; values: unknown[] }
  | { kind: 'or'; clauses: Array<{ col: string; value: string }> }

/**
 * PostgREST stand-in in the shape of certificate-mint.test.ts, plus two things
 * this helper needs: `rpc('generate_sample_number')` hands out a per-lab
 * series, and an INSERT is appended to the seeded rows, so the group read that
 * mintGroupCertificates does afterwards sees the siblings just created — the
 * way the real database behaves. `failInsertWhen` returns a Postgres-shaped
 * error (code + message) for a given attempt on a table, or null to let it
 * through; it drives the 23505 retry tests.
 */
function fakeDb(opts: {
  rows?: Record<string, Row[]>
  failInsertWhen?: (table: string, values: Row, attempt: number) => { code?: string; message: string } | null
} = {}) {
  const rows: Record<string, Row[]> = opts.rows ?? {}
  const writes: Array<{ table: string; op: 'insert' | 'update'; values: Row; filters: Filter[] }> = []
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const attemptsByTable = new Map<string, number>()
  let insertCount = 0
  let sequence = 700
  return {
    rows, writes, rpcCalls,
    async rpc(fn: string, args?: unknown) {
      rpcCalls.push({ fn, args })
      if (fn !== 'generate_sample_number') return { data: null, error: { message: `unknown function ${fn}` } }
      const n = sequence++
      return { data: `SAN-${String(n).padStart(5, '0')}/26`, error: null }
    },
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
      const matching = () => (rows[table] ?? []).filter(matches)
      const settleWrite = () => {
        writes.push({ table, op: op!, values: pending!, filters: [...filters] })
        if (op === 'insert') {
          const attempt = (attemptsByTable.get(table) ?? 0) + 1
          attemptsByTable.set(table, attempt)
          const failure = opts.failInsertWhen?.(table, pending!, attempt)
          if (failure) return { data: null, error: { details: '', hint: '', ...failure } }
          insertCount += 1
          const stored = { id: `${table}-${insertCount}`, created_at: `2026-08-28T12:00:${String(insertCount).padStart(2, '0')}Z`, ...pending }
          ;(rows[table] ??= []).push(stored)
          return { data: stored, error: null }
        }
        for (const row of matching()) Object.assign(row, pending)
        return { data: matching()[0] ?? null, error: null }
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

const labUnit = (over: Partial<Row> = {}): GroupMember =>
  ({ ...mother, lab_source_sample_id: null, contract_ordinal: null, ...over }) as GroupMember

const sampleInserts = (db: ReturnType<typeof fakeDb>) => db.writes.filter((w) => w.table === 'samples' && w.op === 'insert')
const certInserts = (db: ReturnType<typeof fakeDb>) => db.writes.filter((w) => w.table === 'certificates' && w.op === 'insert')

describe('createSiblingSamples', () => {
  it('creates one sibling per input with the next ordinals and fresh lab numbers, and numbers the lab unit 1', async () => {
    const unit = labUnit()
    const db = fakeDb({ rows: { samples: [unit] } })
    const out = await createSiblingSamples(db as any, unit, [
      { importer_id: 'imp2', buyer_contract_nr: 'S049504-14', supplier_contract_nr: 'S664243-14', exporter_sample_number: '130307',
        bag_count: 20, bag_weight_kg: 1000, bag_type: 'big_bag', bags_quantity_mt: 20, equivalent_60kg_bags: 333 },
      { buyer_contract_nr: 'S049504-15', exporter_sample_number: '130308' },
    ], 'user-1')

    expect(out.failed).toEqual([])
    expect(out.created.map((c) => c.contract_ordinal)).toEqual([2, 3])
    expect(out.created.map((c) => c.tracking_number)).toEqual(['SAN-00700/26', 'SAN-00701/26'])
    expect(out.created.every((c) => c.lab_source_sample_id === 'm')).toBe(true)
    expect(out.created[0]).toMatchObject({
      id: 'samples-1', importer_id: 'imp2', buyer_contract_nr: 'S049504-14', seller_contract_nr: 'S664243-14',
      exporter_sample_number: '130307', bag_count: 20, bag_type: 'big_bag', origin: 'BR', laboratory_id: 'lab',
      status: 'approved', split_numbering: true,
    })
    // Blank quantity on the second input falls back to the lab unit's.
    expect(out.created[1]).toMatchObject({ bag_count: 333, bag_type: 'jute_bag', bags_quantity_mt: 19.98, importer_id: null })

    // One number per sibling from the lab's own series; the sibling never reuses the mother's.
    expect(db.rpcCalls).toEqual([
      { fn: 'generate_sample_number', args: { p_laboratory_id: 'lab' } },
      { fn: 'generate_sample_number', args: { p_laboratory_id: 'lab' } },
    ])
    // The insert goes through buildSiblingRow: no id, no sample_contracts, no fee columns.
    for (const w of sampleInserts(db)) {
      expect(w.values.id).toBeUndefined()
      expect(w.values.lab_source_sample_id).toBe('m')
      expect('sample_id' in w.values).toBe(false)
    }
    // A lab unit that had no ordinal becomes contract 1 once it has siblings.
    const ordinalWrite = db.writes.find((w) => w.table === 'samples' && w.op === 'update')!
    expect(ordinalWrite.values).toEqual({ contract_ordinal: 1 })
    expect(ordinalWrite.filters).toEqual([{ kind: 'eq', col: 'id', value: 'm' }])
    // No certificate on the lab unit → none minted for the siblings.
    expect(certInserts(db)).toEqual([])
  })

  it('stores a bulk contract as containers + MT with the derived bag columns', async () => {
    const unit = labUnit({ contract_ordinal: 1 })
    const db = fakeDb({ rows: { samples: [unit] } })
    const out = await createSiblingSamples(db as any, unit, [
      { bag_type: 'bulk', container_count: 2, bags_quantity_mt: 43.2 },
      // MT omitted: defaults to containers × 21.6.
      { bag_type: 'bulk', container_count: 1 },
    ], 'user-1')

    expect(out.failed).toEqual([])
    expect(sampleInserts(db)[0].values).toMatchObject({
      bag_type: 'bulk', container_count: 2, bags_quantity_mt: 43.2, bag_count: 720, equivalent_60kg_bags: 720, bag_weight_kg: 21600,
    })
    expect(sampleInserts(db)[1].values).toMatchObject({
      bag_type: 'bulk', container_count: 1, bags_quantity_mt: 21.6, bag_count: 360, equivalent_60kg_bags: 360, bag_weight_kg: 21600,
    })
    // The lab unit already carried its ordinal: nothing to rewrite.
    expect(db.writes.some((w) => w.table === 'samples' && w.op === 'update')).toBe(false)
  })

  it('continues the ordinal series after the existing siblings, deleted ones included', async () => {
    const unit = labUnit({ contract_ordinal: 1 })
    const db = fakeDb({ rows: { samples: [
      unit,
      { id: 's2', lab_source_sample_id: 'm', contract_ordinal: 2, deleted_at: null },
      { id: 's3', lab_source_sample_id: 'm', contract_ordinal: 3, deleted_at: '2026-08-20T00:00:00Z' },
    ] } })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'S049504-16' }], 'user-1')
    expect(out.created.map((c) => c.contract_ordinal)).toEqual([4])
  })

  it('re-mints the lab number and retries when the insert hits a unique violation', async () => {
    const unit = labUnit()
    const db = fakeDb({
      rows: { samples: [unit] },
      failInsertWhen: (table, _values, attempt) =>
        table === 'samples' && attempt === 1
          ? { code: '23505', message: 'duplicate key value violates unique constraint "samples_client_id_tracking_number_key"' }
          : null,
    })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'S049504-14' }], 'user-1')
    expect(out.failed).toEqual([])
    expect(out.created.map((c) => c.tracking_number)).toEqual(['SAN-00701/26'])
    expect(out.created[0].contract_ordinal).toBe(2)
    expect(db.rpcCalls).toHaveLength(2)
    expect(sampleInserts(db).map((w) => w.values.tracking_number)).toEqual(['SAN-00700/26', 'SAN-00701/26'])
  })

  it('gives up on an input after three unique violations and does not consume its ordinal', async () => {
    const unit = labUnit()
    const db = fakeDb({
      rows: { samples: [unit] },
      failInsertWhen: (table, values) =>
        table === 'samples' && values.buyer_contract_nr === 'DUP'
          ? { code: '23505', message: 'duplicate key value violates unique constraint "idx_unique_exporter_sample_container"' }
          : null,
    })
    const out = await createSiblingSamples(db as any, unit, [
      { buyer_contract_nr: 'DUP' },
      { buyer_contract_nr: 'S049504-15' },
    ], 'user-1')
    expect(out.failed).toEqual([{ index: 0, error: expect.stringContaining('idx_unique_exporter_sample_container') }])
    expect(out.created).toHaveLength(1)
    expect(out.created[0]).toMatchObject({ buyer_contract_nr: 'S049504-15', contract_ordinal: 2 })
    // Three attempts for the failing input, one for the good one.
    expect(db.rpcCalls).toHaveLength(4)
  })

  it('reports a non-unique insert error at once without retrying', async () => {
    const unit = labUnit()
    const db = fakeDb({
      rows: { samples: [unit] },
      failInsertWhen: (table) => (table === 'samples' ? { code: '42501', message: 'new row violates row-level security policy' } : null),
    })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'X' }], 'user-1')
    expect(out.created).toEqual([])
    expect(out.failed).toEqual([{ index: 0, error: 'new row violates row-level security policy' }])
    expect(db.rpcCalls).toHaveLength(1)
  })

  it('mints a certificate for each new sibling when the lab unit is already certified, leaving its own alone', async () => {
    const unit = labUnit({ contract_ordinal: 1 })
    const db = fakeDb({ rows: {
      samples: [unit],
      certificates: [{ id: 'cert-m', sample_id: 'm', certificate_number: 'BR-037250/26', is_rejected: true, revision_number: 0, created_at: '2026-08-02' }],
      companies: [{ id: 'dunkin', name: 'Dunkin Donuts', fantasy_name: 'Dunkin' }],
      qc_client_settings: [{ company_id: 'dunkin', certificate_validity_months: 6 }],
    } })
    const out = await createSiblingSamples(db as any, unit, [
      { buyer_contract_nr: 'S049504-14' },
      { buyer_contract_nr: 'S049504-15' },
    ], 'user-1')

    expect(out.failed).toEqual([])
    expect(out.created).toHaveLength(2)
    const inserts = certInserts(db)
    // Only the two new siblings — the lab unit's certificate is neither re-minted nor revised.
    expect(inserts.map((w) => w.values.sample_id)).toEqual(['samples-1', 'samples-2'])
    expect(db.writes.some((w) => w.table === 'certificates' && w.op === 'update')).toBe(false)
    expect(db.writes.some((w) => w.table === 'certificate_versions')).toBe(false)
    for (const w of inserts) {
      // The lab unit's decision and the client's window; the number comes from the trigger.
      expect(w.values).toMatchObject({ is_rejected: true, issued_by: 'user-1', issued_to: 'Dunkin', status: 'issued', certificate_number: null })
      expect('sample_contract_id' in w.values).toBe(false)
      const from = new Date(w.values.valid_from as string).getTime()
      const until = new Date(w.values.valid_until as string).getTime()
      expect(until).toBeGreaterThan(from + 150 * 24 * 3600 * 1000)
      expect(until).toBeLessThan(from + 190 * 24 * 3600 * 1000)
    }
  })

  it('surfaces a sibling whose certificate could not be minted without undoing the sibling', async () => {
    const unit = labUnit({ contract_ordinal: 1 })
    const db = fakeDb({
      rows: {
        samples: [unit],
        certificates: [{ id: 'cert-m', sample_id: 'm', certificate_number: 'BR-037250/26', is_rejected: false, created_at: '2026-08-02' }],
      },
      failInsertWhen: (table) => (table === 'certificates' ? { code: 'P0001', message: 'assign_certificate_number: no laboratory' } : null),
    })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'S049504-14' }], 'user-1')
    expect(out.created).toHaveLength(1)
    expect(out.failed).toEqual([{ index: 0, error: expect.stringContaining('assign_certificate_number: no laboratory') }])
  })

  it('names the right input when a later sibling is created but its certificate fails', async () => {
    const unit = labUnit({ contract_ordinal: 1 })
    const db = fakeDb({
      rows: {
        samples: [unit],
        certificates: [{ id: 'cert-m', sample_id: 'm', certificate_number: 'BR-037250/26', is_rejected: false, created_at: '2026-08-02' }],
      },
      failInsertWhen: (table, values) => {
        if (table === 'samples' && values.buyer_contract_nr === 'DUP') return { code: '42501', message: 'rls' }
        if (table === 'certificates') return { code: 'P0001', message: 'trigger raised' }
        return null
      },
    })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'DUP' }, { buyer_contract_nr: 'OK' }], 'user-1')
    expect(out.created.map((c) => c.buyer_contract_nr)).toEqual(['OK'])
    expect(out.failed).toEqual([
      { index: 0, error: 'rls' },
      { index: 1, error: expect.stringContaining('trigger raised') },
    ])
  })

  it('does nothing for an empty input list', async () => {
    const unit = labUnit()
    const db = fakeDb({ rows: { samples: [unit] } })
    const out = await createSiblingSamples(db as any, unit, [], 'user-1')
    expect(out).toEqual({ created: [], failed: [] })
    expect(db.writes).toEqual([])
    expect(db.rpcCalls).toEqual([])
  })

  it('falls back to <lab number>-<ordinal> when the lab unit has no laboratory to mint from', async () => {
    const unit = labUnit({ laboratory_id: null })
    const db = fakeDb({ rows: { samples: [unit] } })
    const out = await createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'X' }], 'user-1')
    expect(out.failed).toEqual([])
    expect(out.created[0]).toMatchObject({ tracking_number: 'SAN-00654/26-2', split_numbering: false })
    expect(db.rpcCalls).toEqual([])
  })

  it('refuses a sibling as the lab unit', async () => {
    const unit = labUnit({ id: 's2', lab_source_sample_id: 'm', contract_ordinal: 2 })
    const db = fakeDb({ rows: { samples: [unit] } })
    await expect(createSiblingSamples(db as any, unit, [{ buyer_contract_nr: 'X' }], 'user-1')).rejects.toThrow(/lab unit/)
    expect(db.writes).toEqual([])
  })
})
