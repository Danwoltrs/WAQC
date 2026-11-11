import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionRow } from './types'

/**
 * pinGroupSpec through the REAL resolver: finalizing a lab unit pins every
 * contract sibling, one on a different client quality included (I2).
 */

const g = vi.hoisted(() => ({ groupSampleIds: vi.fn() }))
vi.mock('@/lib/sample-group', () => g)

import { pinGroupSpec } from './lot-spec'

/** Rows per table, narrowed by in/eq/is; update applies and returns the rows. */
function fakeAdmin(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, string, any]> = []
      let values: any = null
      const matches = (row: any) =>
        filters.every(([kind, col, v]) =>
          kind === 'in' ? v.includes(row[col]) : kind === 'eq' ? row[col] === v : v === null ? row[col] == null : row[col] === v,
        )
      const chain: any = {
        select: () => chain,
        update: (v: any) => { values = v; return chain },
        in: (col: string, v: any[]) => { filters.push(['in', col, v]); return chain },
        eq: (col: string, v: any) => { filters.push(['eq', col, v]); return chain },
        is: (col: string, v: any) => { filters.push(['is', col, v]); return chain },
        then(ok: any, bad: any) {
          const rows = (tables[table] ?? []).filter(matches)
          if (values) for (const r of rows) Object.assign(r, values)
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(ok, bad)
        },
      }
      return chain
    },
  } as any
}

const version = (id: string, qid: string): VersionRow => ({
  id, client_quality_id: qid, version_no: 1, effective_from: '2000-01-01',
  spec: { template: { parameters: { tag: id } }, custom_parameters: null, cups_per_sample: null, discrepancy_threshold: null },
  source: 'migration', note: null, created_by: null, created_at: '2026-01-01T00:00:00Z',
  applied_at: '2026-01-01T00:00:00Z', notified_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null,
})
const quality = (id: string) => ({
  id, custom_name: id, quality_code: null, template_id: null, cups_per_sample: null, discrepancy_threshold: null,
  custom_parameters: null, template: null,
})
const sample = (id: string, quality_spec_id: string, lab_source_sample_id: string | null = null) => ({
  id, lab_source_sample_id, quality_spec_id, spec_version_id: null, contract_date: '2026-10-01', contract_id: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('pinGroupSpec with the real resolver', () => {
  it('a different-quality sibling gets pinned when its lab unit is finalized', async () => {
    const tables = {
      samples: [sample('L', 'q-unit'), sample('S1', 'q-unit', 'L'), sample('S2', 'q-other', 'L')],
      contracts: [],
      client_qualities: [quality('q-unit'), quality('q-other')],
      client_quality_versions: [version('vu', 'q-unit'), version('vo', 'q-other')],
    }
    g.groupSampleIds.mockResolvedValue(['L', 'S1', 'S2'])
    const spec = await pinGroupSpec('L', { admin: fakeAdmin(tables) })
    expect(spec?.version).toMatchObject({ id: 'vu', pinned: true })
    const pin = (id: string) => tables.samples.find((s) => s.id === id)?.spec_version_id
    expect(pin('L')).toBe('vu')
    expect(pin('S1')).toBe('vu')
    expect(pin('S2')).toBe('vo')
  })
})
