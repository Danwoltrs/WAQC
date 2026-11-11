import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/samples/bulk-details feeds the cupping-card print: the card prints
 * the lot's quality name, cups and cupping attributes from `quality_spec`. That
 * must be the lot's spec VERSION (pinned, else in force on its contract date),
 * never the live client quality, which a later spec change would rewrite.
 */

const state = vi.hoisted(() => ({ db: null as any }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.db }))
const spec = vi.hoisted(() => ({ resolveSampleSpec: vi.fn(), resolveSampleSpecs: vi.fn() }))
vi.mock('@/lib/quality-spec/resolve', () => spec)

import { POST } from './route'

type Row = Record<string, any>

function fakeDb(tables: Record<string, Row[]>) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from(table: string) {
      const calls: Array<[string, any[]]> = []
      const run = () => {
        let rows = [...(tables[table] ?? [])]
        for (const [op, args] of calls) {
          if (op === 'eq') rows = rows.filter((r) => r[args[0]] === args[1])
          if (op === 'in') rows = rows.filter((r) => (args[1] as any[]).includes(r[args[0]]))
          if (op === 'is') rows = rows.filter((r) => (r[args[0]] ?? null) === args[1])
        }
        return rows
      }
      const chain: any = {
        then(resolve: (v: any) => void) { resolve({ data: run(), error: null }) },
      }
      for (const op of ['select', 'eq', 'in', 'is', 'order']) {
        chain[op] = (...args: any[]) => { calls.push([op, args]); return chain }
      }
      return chain
    },
  }
}

const post = (sample_ids: string[]) =>
  POST(new NextRequest('http://localhost/api/samples/bulk-details', {
    method: 'POST',
    body: JSON.stringify({ sample_ids }),
  }))

const resolved = {
  id: 'cq-1', custom_name: 'Fine Cup', quality_code: 'FC', template_id: 'tpl-1',
  cups_per_sample: 3, discrepancy_threshold: null,
  custom_parameters: { cupping_attributes: [{ attribute: 'Body' }] },
  template: {
    id: 'tpl-1', name: 'Brazil Fine Cup', name_en: null, description: null,
    parameters: { cupping_attributes: [{ attribute: 'Acidity' }] }, methodology: 'cva',
  },
  version: { id: 'ver-1', versionNo: 1, effectiveFrom: '2026-01-01', pinned: false },
}

const tables = () => ({
  samples: [
    { id: 'unit-1', lab_source_sample_id: null, quality_spec_id: 'cq-1', deleted_at: null, created_at: '2026-09-01', wolthers_contract_nr: '1/26' },
    { id: 'sib-1', lab_source_sample_id: 'unit-1', quality_spec_id: 'cq-2', deleted_at: null, created_at: '2026-09-01', wolthers_contract_nr: '2/26' },
    { id: 'unit-2', lab_source_sample_id: null, quality_spec_id: null, deleted_at: null, created_at: '2026-09-02', wolthers_contract_nr: '3/26' },
  ],
  // A live row that disagrees with the version: it must not be read.
  client_qualities: [{ id: 'cq-1', custom_name: 'LIVE', cups_per_sample: 9 }],
})

describe('POST /api/samples/bulk-details', () => {
  beforeEach(() => {
    spec.resolveSampleSpec.mockReset()
    spec.resolveSampleSpecs.mockReset().mockResolvedValue(new Map([['unit-1', resolved]]))
  })

  it('prints each lab unit with its spec version, in the shape the card dialog reads', async () => {
    state.db = fakeDb(tables())
    const body = await (await post(['sib-1', 'unit-2'])).json()
    const unit = body.samples.find((s: any) => s.id === 'unit-1')
    expect(unit.quality_spec).toEqual({
      id: 'cq-1',
      template_id: 'tpl-1',
      custom_name: 'Fine Cup',
      custom_parameters: resolved.custom_parameters,
      cups_per_sample: 3,
      template: {
        id: 'tpl-1',
        name: 'Brazil Fine Cup',
        parameters: resolved.template.parameters,
        methodology: 'cva',
      },
    })
    expect(body.samples.find((s: any) => s.id === 'unit-2').quality_spec).toBeNull()
  })

  it('resolves every lab unit in one call, without pinning', async () => {
    state.db = fakeDb(tables())
    await post(['sib-1', 'unit-2'])
    expect(spec.resolveSampleSpecs).toHaveBeenCalledTimes(1)
    const [ids, opts] = spec.resolveSampleSpecs.mock.calls[0]
    expect([...ids].sort()).toEqual(['unit-1', 'unit-2'])
    expect(opts?.pin).toBeFalsy()
    expect(spec.resolveSampleSpec).not.toHaveBeenCalled()
  })

  it('keeps a null template null', async () => {
    spec.resolveSampleSpecs.mockResolvedValue(new Map([['unit-1', { ...resolved, template: null }]]))
    state.db = fakeDb(tables())
    const body = await (await post(['unit-1'])).json()
    expect(body.samples[0].quality_spec.template).toBeNull()
  })

  it('answers 500 when the spec read fails, rather than printing cards without the spec', async () => {
    spec.resolveSampleSpecs.mockRejectedValue(new Error('boom'))
    state.db = fakeDb(tables())
    expect((await post(['unit-1'])).status).toBe(500)
  })
})
