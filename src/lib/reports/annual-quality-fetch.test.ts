import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchLabUnitQuality, type LabUnitRef } from './annual-quality-fetch'

/** A thenable query builder: every filter returns the chain; awaiting yields the table's rows. */
function fakeDb(tables: Record<string, unknown[]>, errors: Record<string, string> = {}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = []
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const op of ['select', 'in', 'eq', 'neq', 'or', 'overlaps', 'order']) {
        chain[op] = (...args: unknown[]) => {
          calls.push({ table, op, args })
          return chain
        }
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(
          errors[table] ? { data: null, error: { message: errors[table] } } : { data: tables[table] ?? [], error: null },
        ).then(resolve, reject)
      return chain
    },
  } as unknown as SupabaseClient<any>
  return { client, calls }
}

const ref = (labUnitId: string): LabUnitRef => ({ labUnitId, shipper: 'EISA', certificateNumber: `SAK-${labUnitId}/26` })
const qa = (sample_id: string, created_at: string, green: unknown, resolved: unknown = null) =>
  ({ sample_id, created_at, green_bean_data: green, resolved_defects: resolved })

describe('fetchLabUnitQuality', () => {
  it('reads the latest assessment of each lab unit once, whatever order the chunks return', async () => {
    const { client } = fakeDb({
      quality_assessments: [
        qa('lab-1', '2026-06-01T00:00:00Z', { defects: { counts: { Immature: 1 }, primary: 0, secondary: 0.2 } }),
        qa('lab-1', '2026-06-05T00:00:00Z', { defects: { counts: { Immature: 4 }, primary: 0, secondary: 0.8 } }),
      ],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-1'), ref('lab-1')])
    expect(lot.certificateNumber).toBe('SAK-lab-1/26')
    expect((lot.green as { defects: { counts: Record<string, number> } }).defects.counts).toEqual({ Immature: 4 })
  })

  it('prints the validated taint list when one was settled', async () => {
    const { client } = fakeDb({
      quality_assessments: [qa('lab-1', '2026-06-01T00:00:00Z', null, {
        taints: [{ name: 'Phenolic' }], faults: [], resolved_at: '2026-09-11T00:00:00Z',
      })],
      cupping_scores: [{ sample_id: 'lab-1', cupper_id: 'c1', defects: { faults: [{ name: 'Mouldy' }] } }],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-1')])
    expect(lot.cupDefects.map(d => [d.kind, d.name])).toEqual([['Taint', 'Phenolic']])
  })

  it('otherwise takes the master cupper’s card, among the session’s own cuppers only', async () => {
    const { client } = fakeDb({
      cupping_sessions: [{ id: 's1', sample_ids: ['lab-2'], cupper_ids: ['c1', 'c2'], master_cupper_id: 'c2', created_at: '2026-06-01T00:00:00Z' }],
      cupping_scores: [
        { sample_id: 'lab-2', cupper_id: 'c1', defects: { taints: [{ name: 'Hard' }] } },
        { sample_id: 'lab-2', cupper_id: 'c2', defects: { faults: [{ name: 'Mouldy' }] } },
        { sample_id: 'lab-2', cupper_id: 'c9', defects: { taints: [{ name: 'Rioy' }, { name: 'Earthy' }] } },
      ],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-2')])
    expect(lot.cupDefects.map(d => d.name)).toEqual(['Mouldy'])
  })

  it('finds the master through the profile flag when the session names none', async () => {
    const { client } = fakeDb({
      cupping_sessions: [{ id: 's1', sample_ids: ['lab-3'], cupper_ids: ['c3', 'c4'], master_cupper_id: null, created_at: '2026-06-01T00:00:00Z' }],
      profiles: [{ id: 'c4' }],
      cupping_scores: [
        { sample_id: 'lab-3', cupper_id: 'c3', defects: { taints: [{ name: 'Hard' }, { name: 'Rioy' }] } },
        { sample_id: 'lab-3', cupper_id: 'c4', defects: { taints: [] } },
      ],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-3')])
    expect(lot.cupDefects).toEqual([])
  })

  it('falls back to the longer of two cards when nothing was validated and no master is identified', async () => {
    const { client } = fakeDb({
      cupping_sessions: [{ id: 's1', sample_ids: ['lab-10'], cupper_ids: ['c5', 'c6'], master_cupper_id: null, created_at: '2026-06-01T00:00:00Z' }],
      profiles: [],
      cupping_scores: [
        { sample_id: 'lab-10', cupper_id: 'c5', defects: { taints: [{ name: 'Hard' }] } },
        { sample_id: 'lab-10', cupper_id: 'c6', defects: { taints: [{ name: 'Rioy' }, { name: 'Earthy' }] } },
      ],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-10')])
    expect(lot.cupDefects.map(d => d.name)).toEqual(['Rioy', 'Earthy'])
  })

  it('reads a lot approved with comments through its issued values', async () => {
    const tables = {
      quality_assessments: [qa('lab-4', '2026-06-01T00:00:00Z', {
        defects: { counts: { 'Broken/Chipped': 30 }, defect_list: [{ name: 'Broken/Chipped', count: 30 }], primary: 0, secondary: 6 },
      })],
      samples: [{ id: 'lab-4', approved_with_comments: true }],
    }
    const admin = fakeDb({
      sample_tolerance_approvals: [{
        sample_id: 'lab-4', decided_at: '2026-06-02T00:00:00Z',
        issued_values: { screen_percentages: null, defects: { counts: { 'Broken/Chipped': 25 }, primary: 0, secondary: 5, total: 5 } },
      }],
    })
    const [lot] = await fetchLabUnitQuality(fakeDb(tables).client, admin.client, [ref('lab-4')])
    const defects = (lot.green as { defects: Record<string, unknown> }).defects
    expect(defects.counts).toEqual({ 'Broken/Chipped': 25 })
    expect(defects).not.toHaveProperty('defect_list')
  })

  it('withholds the grading of a lot approved with comments when its issued values cannot be read', async () => {
    const { client } = fakeDb({
      quality_assessments: [qa('lab-5', '2026-06-01T00:00:00Z', { defects: { counts: { 'Broken/Chipped': 30 }, primary: 0, secondary: 6 } })],
      samples: [{ id: 'lab-5', approved_with_comments: true }],
    })
    const [lot] = await fetchLabUnitQuality(client, null, [ref('lab-5')])
    expect(lot.green).toBeNull()
  })

  it('withholds every lot’s green when the approved-with-comments flag itself can’t be read (fail closed)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeDb(
      {
        quality_assessments: [
          qa('lab-8', '2026-06-01T00:00:00Z', { defects: { counts: { Immature: 2 }, primary: 0, secondary: 0.4 } }, {
            taints: [{ name: 'Phenolic' }], faults: [], resolved_at: '2026-09-11T00:00:00Z',
          }),
          qa('lab-9', '2026-06-01T00:00:00Z', { defects: { counts: { Immature: 3 }, primary: 0, secondary: 0.6 } }),
        ],
      },
      { samples: 'boom' },
    )
    const lots = await fetchLabUnitQuality(client, null, [ref('lab-8'), ref('lab-9')])
    expect(lots).toHaveLength(2)
    for (const lot of lots) expect(lot.green).toBeNull()
    // Taints/faults are unaffected by the flag-read failure and still resolve.
    expect(lots.find(l => l.labUnitId === 'lab-8')!.cupDefects.map(d => d.name)).toEqual(['Phenolic'])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('degrades instead of throwing when a query fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeDb({}, { quality_assessments: 'boom', cupping_scores: 'boom' })
    const lots = await fetchLabUnitQuality(client, null, [ref('lab-6')])
    expect(lots).toHaveLength(1)
    expect(lots[0].green).toBeNull()
    expect(lots[0].cupDefects).toEqual([])
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('keeps cupping on the commodity protocol', async () => {
    const { client, calls } = fakeDb({})
    await fetchLabUnitQuality(client, null, [ref('lab-7')])
    expect(calls.some(c => c.table === 'cupping_scores' && c.op === 'or')).toBe(true)
    expect(calls.some(c => c.table === 'cupping_sessions' && c.op === 'neq' && c.args[0] === 'session_type')).toBe(true)
  })
})
