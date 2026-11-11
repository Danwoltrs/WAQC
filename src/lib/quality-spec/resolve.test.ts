import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSampleSpec, resolveSampleSpecs, specVersionStatus } from './resolve'
import type { SpecSnapshot, VersionRow } from './types'

/**
 * In-memory Supabase fake. `select` returns the table's rows filtered by
 * in/eq/is; `update` applies to the matching rows and, with `.select()`,
 * returns them. Every call is recorded.
 */
function fakeAdmin(tables: Record<string, any[]>) {
  const calls: Array<{ table: string; op: string; select?: string; values?: any; filters: Array<[string, string, unknown]> }> = []
  const admin = {
    from(table: string) {
      const call: any = { table, op: 'select', filters: [] }
      calls.push(call)
      const matches = (row: any) =>
        call.filters.every(([kind, col, v]: [string, string, any]) => {
          if (kind === 'in') return (v as unknown[]).includes(row[col])
          if (kind === 'eq') return row[col] === v
          if (kind === 'is') return v === null ? row[col] == null : row[col] === v
          return true
        })
      const chain: any = {
        select(cols?: string) { if (call.op === 'select') call.select = cols; return chain },
        update(values: any) { call.op = 'update'; call.values = values; return chain },
        in(col: string, v: unknown[]) { call.filters.push(['in', col, v]); return chain },
        eq(col: string, v: unknown) { call.filters.push(['eq', col, v]); return chain },
        is(col: string, v: unknown) { call.filters.push(['is', col, v]); return chain },
        then(ok: any, bad: any) {
          const rows = (tables[table] ?? []).filter(matches)
          if (call.op === 'update') for (const r of rows) Object.assign(r, call.values)
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(ok, bad)
        },
      }
      return chain
    },
  }
  return { admin: admin as any, calls }
}

const SPEC = (tag: string, extra: Partial<SpecSnapshot['template']> = {}): SpecSnapshot => ({
  template: { parameters: { tag }, methodology: `m-${tag}`, cva_min_score: 80, ...extra },
  custom_parameters: { cp: tag },
  cups_per_sample: 5,
  discrepancy_threshold: 2,
})

function version(id: string, n: number, effective_from: string, qid = 'q1', extra: Partial<VersionRow> = {}): VersionRow {
  return {
    id, client_quality_id: qid, version_no: n, effective_from, spec: SPEC(id),
    source: 'client', note: null, created_by: null, created_at: '2026-01-01T00:00:00Z',
    applied_at: '2026-01-01T00:00:00Z', notified_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null,
    ...extra,
  }
}

const LIVE_TEMPLATE = {
  id: 't1', name: 'Live name', name_en: 'Live name EN', description: 'Live description',
  parameters: { tag: 'live' }, methodology: 'm-live', cva_min_score: 84,
}
function quality(id = 'q1', template: any = LIVE_TEMPLATE) {
  return {
    id, custom_name: 'Client GC17', quality_code: 'GC17', template_id: template?.id ?? null,
    cups_per_sample: 3, discrepancy_threshold: 1, custom_parameters: { cp: 'live' }, template,
  }
}
function sample(id: string, extra: Record<string, any> = {}) {
  return { id, lab_source_sample_id: null, quality_spec_id: 'q1', spec_version_id: null, contract_date: null, contract_id: null, ...extra }
}

const V1 = () => version('v1', 1, '2000-01-01')
const V2 = () => version('v2', 2, '2026-09-01')

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
})
afterEach(() => {
  warn.mockRestore()
  vi.useRealTimers()
})

describe('resolveSampleSpecs', () => {
  it('lab unit decides: a sibling resolves by the lab unit date, and pin writes the same id on both', async () => {
    const tables = {
      samples: [
        sample('L', { contract_date: '2026-10-01' }),
        sample('S', { lab_source_sample_id: 'L', contract_date: '2026-08-01' }),
      ],
      contracts: [],
      client_qualities: [quality()],
      client_quality_versions: [V1(), V2()],
    }
    const { admin } = fakeAdmin(tables)
    const map = await resolveSampleSpecs(['S'], { pin: true, admin })
    expect(map.get('S')?.version).toEqual({ id: 'v2', versionNo: 2, effectiveFrom: '2026-09-01', pinned: true })
    expect(tables.samples.find((s) => s.id === 'L')?.spec_version_id).toBe('v2')
    expect(tables.samples.find((s) => s.id === 'S')?.spec_version_id).toBe('v2')
  })

  it('without pin nothing is written and the version is not pinned', async () => {
    const tables = {
      samples: [sample('L', { contract_date: '2026-10-01' })],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin, calls } = fakeAdmin(tables)
    const map = await resolveSampleSpecs(['L'], { admin })
    expect(map.get('L')?.version).toMatchObject({ id: 'v2', pinned: false })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
    expect(tables.samples[0].spec_version_id).toBeNull()
  })

  it('pinned wins over the contract date', async () => {
    const tables = {
      samples: [sample('A', { spec_version_id: 'v1', contract_date: '2026-10-01' })],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin } = fakeAdmin(tables)
    const r = await resolveSampleSpec('A', { admin })
    expect(r?.version).toEqual({ id: 'v1', versionNo: 1, effectiveFrom: '2000-01-01', pinned: true })
    expect(r?.template?.parameters).toEqual({ tag: 'v1' })
  })

  it('a dangling pin falls back to the date pick, is not pinned, and warns once', async () => {
    const tables = {
      samples: [sample('A', { spec_version_id: 'v-gone', contract_date: '2026-10-01' })],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin } = fakeAdmin(tables)
    const r = await resolveSampleSpec('A', { pin: true, admin })
    expect(r?.version).toMatchObject({ id: 'v2', pinned: false })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0].join(' '))).toContain('A')
    expect(String(warn.mock.calls[0].join(' '))).toContain('v-gone')
    expect(tables.samples[0].spec_version_id).toBe('v-gone')
  })

  it('samples.contract_date wins over contracts.contract_date', async () => {
    const tables = {
      samples: [sample('A', { contract_date: '2026-08-15', contract_id: 'c1' })],
      contracts: [{ id: 'c1', contract_date: '2026-10-01' }],
      client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin } = fakeAdmin(tables)
    expect((await resolveSampleSpec('A', { admin }))?.version?.id).toBe('v1')
  })

  it('contracts.contract_date is used when the lab typed none (timestamps sliced to the date)', async () => {
    const tables = {
      samples: [sample('A', { contract_id: 'c1' })],
      contracts: [{ id: 'c1', contract_date: '2026-09-01T00:00:00+00:00' }],
      client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin, calls } = fakeAdmin(tables)
    expect((await resolveSampleSpec('A', { admin }))?.version?.id).toBe('v2')
    expect(calls.some((c) => c.table === 'contracts')).toBe(true)
  })

  it('no contract date at all uses today in Sao Paulo', async () => {
    const tables = {
      samples: [sample('A')],
      contracts: [], client_qualities: [quality()],
      client_quality_versions: [V1(), version('v3', 3, '2026-11-11')],
    }
    const { admin } = fakeAdmin(tables)
    expect((await resolveSampleSpec('A', { admin }))?.version?.id).toBe('v3')
    vi.setSystemTime(new Date('2026-11-11T02:00:00Z')) // still 10 Nov in Sao Paulo
    expect((await resolveSampleSpec('A', { admin }))?.version?.id).toBe('v1')
  })

  it('a quality without version rows falls back to the live join with version null and warns once', async () => {
    const tables = {
      samples: [sample('A'), sample('B')],
      contracts: [], client_qualities: [quality()], client_quality_versions: [],
    }
    const { admin } = fakeAdmin(tables)
    const map = await resolveSampleSpecs(['A', 'B'], { pin: true, admin })
    expect(map.get('A')).toEqual({
      id: 'q1', custom_name: 'Client GC17', quality_code: 'GC17', template_id: 't1',
      cups_per_sample: 3, discrepancy_threshold: 1, custom_parameters: { cp: 'live' },
      template: LIVE_TEMPLATE, version: null,
    })
    expect(map.get('B')?.version).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0].join(' '))).toContain('q1')
    expect(tables.samples.every((s) => s.spec_version_id === null)).toBe(true)
  })

  it('a quality without a template and without versions resolves with template null', async () => {
    const { admin } = fakeAdmin({
      samples: [sample('A')], contracts: [], client_qualities: [quality('q1', null)], client_quality_versions: [],
    })
    const r = await resolveSampleSpec('A', { admin })
    expect(r).toMatchObject({ id: 'q1', template_id: null, template: null, version: null })
  })

  it('pin never overwrites an existing spec_version_id', async () => {
    const tables = {
      samples: [
        sample('L', { spec_version_id: 'v1', contract_date: '2026-10-01' }),
        sample('S1', { lab_source_sample_id: 'L', spec_version_id: 'v2' }),
        sample('S2', { lab_source_sample_id: 'L' }),
      ],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    }
    const { admin } = fakeAdmin(tables)
    const map = await resolveSampleSpecs(['L'], { pin: true, admin })
    expect(map.get('L')?.version).toMatchObject({ id: 'v1', pinned: true })
    const pins = Object.fromEntries(tables.samples.map((s) => [s.id, s.spec_version_id]))
    expect(pins).toEqual({ L: 'v1', S1: 'v2', S2: 'v1' })
  })

  it('names stay live, everything else comes from the version snapshot', async () => {
    const tables = {
      samples: [sample('A', { spec_version_id: 'v1' })],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1()],
    }
    const { admin } = fakeAdmin(tables)
    const r = await resolveSampleSpec('A', { admin })
    expect(r).toEqual({
      id: 'q1', custom_name: 'Client GC17', quality_code: 'GC17', template_id: 't1',
      cups_per_sample: 5, discrepancy_threshold: 2, custom_parameters: { cp: 'v1' },
      template: {
        id: 't1', name: 'Live name', name_en: 'Live name EN', description: 'Live description',
        parameters: { tag: 'v1' }, methodology: 'm-v1', cva_min_score: 80,
      },
      version: { id: 'v1', versionNo: 1, effectiveFrom: '2000-01-01', pinned: true },
    })
  })

  it('reads with the template FK hint and every spec column', async () => {
    const { admin, calls } = fakeAdmin({
      samples: [sample('A')], contracts: [], client_qualities: [quality()], client_quality_versions: [V1()],
    })
    await resolveSampleSpec('A', { admin })
    const cq = calls.find((c) => c.table === 'client_qualities')
    expect(cq?.select).toContain('template:quality_templates!client_qualities_template_id_fkey(')
    expect(cq?.select).toContain('screen_size_requirements')
    expect(cq?.select).not.toContain('fee_')
  })

  it('a sample without a quality is left out; resolveSampleSpec returns null', async () => {
    const { admin } = fakeAdmin({
      samples: [sample('A', { quality_spec_id: null })], contracts: [], client_qualities: [], client_quality_versions: [],
    })
    expect((await resolveSampleSpecs(['A'], { admin })).size).toBe(0)
    expect(await resolveSampleSpec('A', { admin })).toBeNull()
    expect(await resolveSampleSpec('missing', { admin })).toBeNull()
  })

  it('an empty id list makes no query', async () => {
    const { admin, calls } = fakeAdmin({})
    expect((await resolveSampleSpecs([], { admin })).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('specVersionStatus', () => {
  it('flags a mismatch when the pinned version differs from the date pick', async () => {
    const { admin } = fakeAdmin({
      samples: [sample('A', { spec_version_id: 'v1', contract_date: '2026-10-01' })],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    })
    const s = await specVersionStatus('A', admin)
    expect(s.pinned?.id).toBe('v1')
    expect(s.implied?.id).toBe('v2')
    expect(s.mismatch).toBe(true)
  })

  it('no mismatch when the pin is the date pick, or when nothing is pinned', async () => {
    const { admin } = fakeAdmin({
      samples: [
        sample('A', { spec_version_id: 'v2', contract_date: '2026-10-01' }),
        sample('B', { contract_date: '2026-10-01' }),
      ],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    })
    expect(await specVersionStatus('A', admin)).toMatchObject({ mismatch: false })
    expect(await specVersionStatus('B', admin)).toMatchObject({ pinned: null, mismatch: false })
    expect((await specVersionStatus('B', admin)).implied?.id).toBe('v2')
  })

  it('a sibling reports its lab unit pin', async () => {
    const { admin } = fakeAdmin({
      samples: [
        sample('L', { spec_version_id: 'v1', contract_date: '2026-10-01' }),
        sample('S', { lab_source_sample_id: 'L', contract_date: '2026-08-01' }),
      ],
      contracts: [], client_qualities: [quality()], client_quality_versions: [V1(), V2()],
    })
    expect(await specVersionStatus('S', admin)).toMatchObject({ pinned: { id: 'v1' }, implied: { id: 'v2' }, mismatch: true })
  })
})
