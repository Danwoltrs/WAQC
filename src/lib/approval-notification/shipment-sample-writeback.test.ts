import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSyncIssue = vi.hoisted(() => vi.fn(async (_admin: unknown, _issue: Record<string, unknown>) => {}))
vi.mock('./sys-sync-issues', () => ({ insertSyncIssue }))

import {
  selectShipmentSampleTargets,
  applyShipmentSampleApproval,
  buildWritebackUpdate,
  buildWritebackInsert,
  type ShipmentSampleRow,
} from './shipment-sample-writeback'

const r = (over: Partial<ShipmentSampleRow>): ShipmentSampleRow => ({
  id: 'id1',
  waqc_ref: null,
  sample_type: 'pss',
  group_id: null,
  status: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('selectShipmentSampleTargets — PSS', () => {
  it('prefers an exact waqc_ref match', () => {
    const rows = [r({ id: 'a', waqc_ref: 'OTHER' }), r({ id: 'b', waqc_ref: 'BR-036991/26' })]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: ['b'], insert: false })
  })
  it('updates EVERY row already claimed under our ref (idempotent group resend)', () => {
    const rows = [
      r({ id: 'l1', waqc_ref: 'SAN-00081/26', group_id: 'g1' }),
      r({ id: 'l2', waqc_ref: 'SAN-00081/26', group_id: 'g1' }),
      r({ id: 'other', waqc_ref: 'ELSE/26' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26')).toEqual({
      updateIds: ['l1', 'l2'],
      insert: false,
    })
  })
  it('claims a single unclaimed PSS placeholder when no waqc_ref match', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: ['pss'], insert: false })
  })
  it('claims ALL leaves of a single container-split group (the core fix)', () => {
    // Real Ahold shape: one "per sub" group, two unclaimed per-container leaves.
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26')).toEqual({
      updateIds: ['slot1', 'slot2'],
      insert: false,
    })
  })
  it('does NOT phantom-insert when unclaimed group leaves exist (old bug)', () => {
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00081/26').insert).toBe(false)
  })
  it('skips (no insert, no clobber) when two distinct groups are ambiguous', () => {
    const rows = [
      r({ id: 'a', group_id: 'g1', waqc_ref: null }),
      r({ id: 'b', group_id: 'g2', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'X/26')).toEqual({ updateIds: [], insert: false })
  })
  it('skips when multiple standalone placeholders are ambiguous', () => {
    const rows = [
      r({ id: 'a', sample_type: 'pss', waqc_ref: null }),
      r({ id: 'b', sample_type: 'pss', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  it('never overwrites a PSS row that already has a different waqc_ref (skips)', () => {
    const rows = [r({ id: 'a', sample_type: 'pss', waqc_ref: 'SOMEONE-ELSE/26', status: 'approved' })]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  // A re-sample after a rejection: the contract's only PSS row(s) belong to the
  // REJECTED ref, so the new sample can be none of them. Skipping here is what
  // left 41858/26, 41859/26, 42201/26 and 42262/26 reading "Rejected" on sys
  // for weeks after QC had approved the second sample.
  it('inserts a fresh row for a re-sample when every PSS row is claimed by another ref AND rejected', () => {
    const rows = [r({ id: 'a', waqc_ref: 'SAN-00523/26', status: 'rejected' })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00550/26')).toEqual({ updateIds: [], insert: true })
  })
  it('inserts a fresh row for a re-sample when the rejected rows are a container-split group (41859/26)', () => {
    const rows = [
      r({ id: 'l1', group_id: 'g1', waqc_ref: 'SAN-00523/26', status: 'rejected' }),
      r({ id: 'l2', group_id: 'g1', waqc_ref: 'SAN-00523/26', status: 'rejected' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAX-011820/26')).toEqual({ updateIds: [], insert: true })
  })
  it('still skips when a row claimed by another ref is not rejected (unknown status)', () => {
    const rows = [r({ id: 'a', waqc_ref: 'SOMEONE-ELSE/26', status: null })]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  it('still skips when a rejected row under another ref sits beside an unclaimed ambiguous mix', () => {
    const rows = [
      r({ id: 'a', waqc_ref: 'SOMEONE-ELSE/26', status: 'rejected' }),
      r({ id: 'b', waqc_ref: null }),
      r({ id: 'c', waqc_ref: null }),
    ]
    expect(selectShipmentSampleTargets(rows, 'BR-036991/26')).toEqual({ updateIds: [], insert: false })
  })
  it('inserts a fresh row when the contract has no PSS row at all', () => {
    expect(selectShipmentSampleTargets([], 'X')).toEqual({ updateIds: [], insert: true })
  })
  it('SELF-HEALS: a phantom standalone carrying our ref no longer blocks the real leaves', () => {
    // Exact mirror of the broken Ahold 42067 record: two unclaimed real leaves
    // plus the phantom standalone a prior buggy run inserted under our ref.
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: null }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: null }),
      r({ id: 'phantom', group_id: null, waqc_ref: 'SAN-00081/26' }),
    ]
    const t = selectShipmentSampleTargets(rows, 'SAN-00081/26')
    expect(t.insert).toBe(false)
    expect([...t.updateIds].sort()).toEqual(['phantom', 'slot1', 'slot2'])
  })
  it('re-completes a container-split group that grew after the first claim', () => {
    // We already hold slot1/slot2 under our ref; sys later added slot3 (unclaimed).
    const rows = [
      r({ id: 'slot1', group_id: 'g1', waqc_ref: 'SAN-00081/26' }),
      r({ id: 'slot2', group_id: 'g1', waqc_ref: 'SAN-00081/26' }),
      r({ id: 'slot3', group_id: 'g1', waqc_ref: null }),
    ]
    const t = selectShipmentSampleTargets(rows, 'SAN-00081/26')
    expect(t.insert).toBe(false)
    expect([...t.updateIds].sort()).toEqual(['slot1', 'slot2', 'slot3'])
  })
})

describe('selectShipmentSampleTargets — SS sample type', () => {
  it('matches an existing SS row by exact waqc_ref, ignoring the PSS row', () => {
    const rows = [
      r({ id: 'pss', sample_type: 'pss', waqc_ref: 'OLD-PSS/26' }),
      r({ id: 'ss', sample_type: 'ss', waqc_ref: 'SAN-00060/26' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: ['ss'], insert: false })
  })
  it('never claims a PSS placeholder for an SS decision (→ insert a new SS row)', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: null })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
  it('does not hijack a PSS row that happens to share the waqc_ref', () => {
    const rows = [r({ id: 'pss', sample_type: 'pss', waqc_ref: 'SAN-00060/26' })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
  it('inserts a distinct SS row even when other claimed SS rows exist', () => {
    const rows = [r({ id: 'ss-other', sample_type: 'ss', waqc_ref: 'OTHER-SS/26' })]
    expect(selectShipmentSampleTargets(rows, 'SAN-00060/26', 'ss')).toEqual({ updateIds: [], insert: true })
  })
})

describe('buildWritebackInsert / buildWritebackUpdate — SS marked QC', () => {
  it('inserts a distinct ss row tagged source=qc', () => {
    const p = buildWritebackInsert({
      contractId: 'k1',
      waqcRef: 'SAN-00060/26',
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-24',
      certificateUrl: null,
      sampleType: 'ss',
      source: 'qc',
    })
    expect(p).toEqual({
      contract_id: 'k1',
      sample_type: 'ss',
      source: 'qc',
      waqc_ref: 'SAN-00060/26',
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-24',
      certificate_url: null,
      created_by: 'u1',
    })
  })
  it('marks an existing row source=qc on update when provided', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-24',
      certificateUrl: null,
      waqcRef: 'SAN-00060/26',
      source: 'qc',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-24',
      certificate_url: null,
      waqc_ref: 'SAN-00060/26',
      source: 'qc',
    })
  })
})

describe('buildWritebackUpdate / buildWritebackInsert', () => {
  it('builds an approved update payload', () => {
    const p = buildWritebackUpdate({
      decision: 'approved',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: 'path/cert.pdf',
      waqcRef: 'BR-036991/26',
    })
    expect(p).toEqual({
      status: 'approved',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: 'path/cert.pdf',
      waqc_ref: 'BR-036991/26',
    })
  })
  it('omits approver + decision date on a sync-only edit re-sync', () => {
    const p = buildWritebackUpdate({
      decision: 'rejected',
      userId: 'editor-1',
      today: '2026-06-26',
      certificateUrl: null,
      waqcRef: 'SAN-00081/26',
      syncOnly: true,
    })
    expect(p).toEqual({
      status: 'rejected',
      certificate_url: null,
      waqc_ref: 'SAN-00081/26',
    })
    expect(p).not.toHaveProperty('approved_by')
    expect(p).not.toHaveProperty('approved_date')
  })
  it('builds an insert payload with contract link and waqc_ref', () => {
    const p = buildWritebackInsert({
      contractId: 'k1',
      waqcRef: 'BR-036991/26',
      decision: 'rejected',
      userId: 'u1',
      today: '2026-06-03',
      certificateUrl: null,
    })
    expect(p).toEqual({
      contract_id: 'k1',
      sample_type: 'pss',
      waqc_ref: 'BR-036991/26',
      status: 'rejected',
      approved_by: 'u1',
      approved_date: '2026-06-03',
      certificate_url: null,
      created_by: 'u1',
    })
  })
})

// A buyer-sample request (sys 0989) is a 'requested' row with no waqc_ref that
// points at our pre-approved row through pre_approval_of. It is the BUYER's
// sample, never ours: no decision may claim it or count it.
describe('selectShipmentSampleTargets — buyer-sample requests are never ours', () => {
  it('an approved anchor and its open request: only the anchor is targeted', () => {
    const rows = [
      r({ id: 'anchor', waqc_ref: 'SAN-00921/26', status: 'approved' }),
      r({ id: 'req', waqc_ref: null, status: 'requested', pre_approval_of: 'anchor' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00921/26')).toEqual({ updateIds: ['anchor'], insert: false })
  })

  it('a re-sample after a reversed pre-approval gets its own row, never the buyer request', () => {
    const rows = [
      r({ id: 'anchor', waqc_ref: 'SAN-00921/26', status: 'rejected' }),
      r({ id: 'req', waqc_ref: null, status: 'requested', pre_approval_of: 'anchor' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00950/26')).toEqual({ updateIds: [], insert: true })
  })

  it('a buyer request does not make a single placeholder ambiguous', () => {
    const rows = [
      r({ id: 'placeholder', waqc_ref: null, status: 'requested' }),
      r({ id: 'req', waqc_ref: null, status: 'requested', pre_approval_of: 'other-contract-row' }),
    ]
    expect(selectShipmentSampleTargets(rows, 'SAN-00950/26')).toEqual({ updateIds: ['placeholder'], insert: false })
  })
})

/** Records selects, updates and inserts on shipment_samples; `selectError`
 *  answers a select whose column list matches it. */
function fakeAdmin(rows: Array<Record<string, unknown>>, selectError?: { when: RegExp; error: { code: string; message: string } }) {
  const selects: string[] = []
  const writes: Array<{ op: 'update' | 'insert'; payload: Record<string, unknown>; ids?: unknown }> = []
  const admin = {
    from(_table: string) {
      let cols = ''
      let op: 'select' | 'update' | 'insert' = 'select'
      let payload: Record<string, unknown> = {}
      let ids: unknown
      const q: Record<string, unknown> = {}
      const result = () => {
        if (op === 'select') {
          selects.push(cols)
          if (selectError && selectError.when.test(cols)) return { data: null, error: selectError.error }
          // A real PostgREST select returns only the asked columns.
          const asked = cols.split(',').map((c) => c.trim())
          return { data: rows.map((row) => Object.fromEntries(asked.map((c) => [c, row[c] ?? null]))), error: null }
        }
        writes.push({ op, payload, ids })
        return { data: op === 'insert' ? { id: 'inserted' } : null, error: null }
      }
      Object.assign(q, {
        select: (c?: string) => { if (op === 'select') cols = c ?? ''; return q },
        update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return q },
        insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return q },
        eq: () => q,
        in: (_c: string, v: unknown) => { ids = v; return q },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      })
      return q
    },
  }
  return { admin, selects, writes }
}

const decision = {
  contractId: 'contract-41923',
  waqcRef: 'SAN-00921/26',
  decision: 'approved' as const,
  userId: 'u1',
  today: '2026-11-18',
  certificateUrl: null,
  sampleId: 'san-921',
}

describe('applyShipmentSampleApproval — the candidate read', () => {
  beforeEach(() => insertSyncIssue.mockClear())

  const rows = [
    { id: 'anchor', waqc_ref: null, sample_type: 'pss', group_id: null, status: 'requested', created_at: '2026-11-01T00:00:00Z', pre_approval_of: null },
    { id: 'req', waqc_ref: null, sample_type: 'pss', group_id: null, status: 'requested', created_at: '2026-11-02T00:00:00Z', pre_approval_of: 'x' },
  ]

  it('reads pre_approval_of, so a buyer request never blocks the claim', async () => {
    const { admin, selects, writes } = fakeAdmin(rows)
    await applyShipmentSampleApproval(admin as never, decision)
    expect(selects[0]).toContain('pre_approval_of')
    expect(writes[0]).toMatchObject({ op: 'update', ids: ['anchor'] })
  })

  it('falls back to the old column list when sys has no pre_approval_of yet (42703)', async () => {
    const { admin, selects, writes } = fakeAdmin([rows[0]], {
      when: /pre_approval_of/,
      error: { code: '42703', message: 'column shipment_samples.pre_approval_of does not exist' },
    })
    await applyShipmentSampleApproval(admin as never, decision)
    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('pre_approval_of')
    expect(writes[0]).toMatchObject({ op: 'update', ids: ['anchor'] })
    expect(insertSyncIssue).not.toHaveBeenCalled()
  })

  it('a failed read writes nothing (no phantom insert) and logs the issue', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin, writes } = fakeAdmin(rows, {
      when: /./,
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
    })
    expect(await applyShipmentSampleApproval(admin as never, decision)).toBeNull()
    expect(writes).toEqual([])
    expect(insertSyncIssue).toHaveBeenCalledWith(admin, expect.objectContaining({ stage: 'decision', reason: 'writeback_error' }))
    err.mockRestore()
  })
})
