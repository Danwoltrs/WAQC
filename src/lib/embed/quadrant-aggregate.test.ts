// Test runner: npx vitest run src/lib/embed/quadrant-aggregate.test.ts
// (project uses vitest — see package.json scripts.test and vitest.config.ts)

import { describe, it, expect } from 'vitest'
import { aggregateQuadrant, loadSampleOwnership } from './quadrant-aggregate'

// Minimal Supabase query-builder stub. Every filter/order method returns the
// builder so arbitrary chains resolve; maybeSingle()/then() resolve to rows[table].
function fakeClient(rows: Record<string, any>) {
  return {
    from(table: string) {
      const builder: any = {
        _table: table,
        select() { return builder },
        eq() { return builder },
        neq() { return builder },
        or() { return builder },
        is() { return builder },
        in() { return builder },
        contains() { return builder },
        order() { return builder },
        limit() { return builder },
        maybeSingle() {
          return Promise.resolve({ data: rows[table] ?? null, error: null })
        },
        then(res: any) {
          return Promise.resolve({ data: rows[table] ?? null, error: null }).then(res)
        },
      }
      return builder
    },
  }
}

describe('aggregateQuadrant', () => {
  it('returns null when sample is missing', async () => {
    const out = await aggregateQuadrant(fakeClient({}) as any, 'uuid-1')
    expect(out).toBeNull()
  })

  it('returns null when sample is soft-deleted', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        tracking_number: 'SAN-1',
        deleted_at: '2026-01-01T00:00:00Z',
        client_id: 'c1',
        end_client_id: null,
      },
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out).toBeNull()
  })

  it('assembles sample + qualityAssessment + cupping', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        tracking_number: 'SAN-1',
        deleted_at: null,
        client_id: 'c1',
        end_client_id: null,
      },
      quality_assessments: {
        sample_id: 'uuid-1',
        green_bean_data: { moisture: 11 },
      },
      cupping_scores: {
        sample_id: 'uuid-1',
        total: 84,
      },
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out).not.toBeNull()
    expect(out!.sample.tracking_number).toBe('SAN-1')
    expect(out!.qualityAssessment!.green_bean_data!.moisture).toBe(11)
  })

  it('cupping is null when no scores exist', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        tracking_number: 'SAN-1',
        deleted_at: null,
        client_id: 'c1',
        end_client_id: null,
      },
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out).not.toBeNull()
    expect(out!.cupping).toBeNull()
  })

  it('scopes cupping to the active session assigned cuppers (excludes removed cuppers)', async () => {
    // Session assigns only cupper "keep". A stray score from a removed cupper
    // "drop" must NOT influence the aggregate — mirrors aggregate/route.ts filter.
    const sample = {
      id: 'uuid-1',
      tracking_number: 'SAN-1',
      deleted_at: null,
      client_id: 'c1',
      end_client_id: null,
      quality_spec_id: null,
    }
    const client = fakeClient({
      samples: sample,
      cupping_sessions: {
        id: 'sess-1',
        cupper_ids: ['keep'],
        master_cupper_id: null,
      },
      cupping_scores: [
        { id: 's1', cupper_id: 'keep', scores: { Acidity: 8 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
        { id: 's2', cupper_id: 'drop', scores: { Acidity: 2 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping).not.toBeNull()
    // Only the assigned cupper counted → total_cuppers 1, mean = 8 (not (8+2)/2).
    expect(out!.cupping!.total_cuppers).toBe(1)
    expect(out!.cupping!.attributes.Acidity.mean).toBe(8)
    expect(out!.cupping!.attributes.Acidity.finalScore).toBe(8)
  })

  it('applies per-attribute increment from the quality spec (not fixed 0.25)', async () => {
    // Spec increment of 1 → mean 8.4 rounds to 8 (0.25 increment would give 8.5).
    const sample = {
      id: 'uuid-1',
      tracking_number: 'SAN-1',
      deleted_at: null,
      client_id: 'c1',
      end_client_id: null,
      quality_spec_id: 'spec-1',
    }
    const client = fakeClient({
      samples: sample,
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a', 'b'], master_cupper_id: null },
      client_qualities: {
        custom_parameters: {
          cupping_attributes: [
            { attribute: 'Body', scale: { type: 'numeric', increment: 1 } },
          ],
        },
        template: null,
      },
      cupping_scores: [
        { id: 's1', cupper_id: 'a', scores: { Body: 8.2 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
        { id: 's2', cupper_id: 'b', scores: { Body: 8.6 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping!.attributes.Body.increment).toBe(1)
    // mean 8.4 rounded to nearest 1 → 8
    expect(out!.cupping!.attributes.Body.finalScore).toBe(8)
  })

  it('derives isCVA + cvaMinScore from a CVA quality spec template', async () => {
    // Mirrors the cert editor (use-cert-editor.ts:298-300): template.methodology
    // === 'cva' → isCVA true; template.cva_min_score surfaces as cvaMinScore.
    const sample = {
      id: 'uuid-1',
      tracking_number: 'SAN-1',
      deleted_at: null,
      client_id: 'c1',
      end_client_id: null,
      quality_spec_id: 'spec-1',
    }
    const client = fakeClient({
      samples: sample,
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a'], master_cupper_id: null },
      client_qualities: {
        custom_parameters: null,
        template: { parameters: null, methodology: 'cva', cva_min_score: 80 },
      },
      cupping_scores: [
        { id: 's1', cupper_id: 'a', scores: { Acidity: 8 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping!.isCVA).toBe(true)
    expect(out!.cupping!.cvaMinScore).toBe(80)
  })

  it('splits the protocols: attributes from the commodity rows, cva_score from the CVA row', async () => {
    // A lot cupped on both surfaces owns rows of both shapes. The CVA row's
    // `scores` is a whole CvaAssessment — averaging it beside the commodity rows
    // would invent attributes called `version`, `u` and `d` — but it is also the
    // only row carrying cva_score, which the certificate editor reads.
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        tracking_number: 'SAN-1',
        deleted_at: null,
        client_id: 'c1',
        end_client_id: null,
        quality_spec_id: 'spec-1',
      },
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a', 'b'], master_cupper_id: null },
      client_qualities: {
        custom_parameters: null,
        template: { parameters: null, methodology: 'cva', cva_min_score: 84 },
      },
      cupping_scores: [
        { id: 's1', cupper_id: 'a', protocol: null, scores: { Acidity: 8 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
        { id: 's2', cupper_id: 'b', protocol: null, scores: { Acidity: 7 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
        {
          id: 's3',
          cupper_id: 'a',
          protocol: 'cva',
          cva_score: 88.75,
          scores: { version: 1, score: 88.75, u: 0, d: 0 },
          defects: {},
          created_at: '2026-01-02',
          sample: { id: 'uuid-1', tracking_number: 'SAN-1' },
        },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(Object.keys(out!.cupping!.attributes).sort()).toEqual(['Acidity'])
    expect(out!.cupping!.attributes.Acidity.values.sort()).toEqual([7, 8])
    expect(out!.cupping!.cva_score).toBe(88.75)
    expect(out!.cupping!.total_cuppers).toBe(2)
  })

  it('keeps the CVA score for a specialty lot that has no commodity rows at all', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        tracking_number: 'SAN-1',
        deleted_at: null,
        client_id: 'c1',
        end_client_id: null,
        quality_spec_id: 'spec-1',
      },
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a'], master_cupper_id: null },
      client_qualities: {
        custom_parameters: null,
        template: { parameters: null, methodology: 'cva', cva_min_score: 84 },
      },
      cupping_scores: [
        {
          id: 's1',
          cupper_id: 'a',
          protocol: 'cva',
          cva_score: 88.75,
          scores: { version: 1, score: 88.75, u: 0, d: 0 },
          defects: {},
          created_at: '2026-01-02',
          sample: { id: 'uuid-1', tracking_number: 'SAN-1' },
        },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping).not.toBeNull()
    expect(out!.cupping!.cva_score).toBe(88.75)
    expect(out!.cupping!.attributes).toEqual({})
    expect(out!.cupping!.total_cuppers).toBe(1)
  })

  it('isCVA is false for a non-CVA (SCA) quality spec template', async () => {
    const sample = {
      id: 'uuid-1',
      tracking_number: 'SAN-1',
      deleted_at: null,
      client_id: 'c1',
      end_client_id: null,
      quality_spec_id: 'spec-1',
    }
    const client = fakeClient({
      samples: sample,
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a'], master_cupper_id: null },
      client_qualities: {
        custom_parameters: null,
        template: { parameters: null, methodology: 'sca', cva_min_score: null },
      },
      cupping_scores: [
        { id: 's1', cupper_id: 'a', scores: { Acidity: 8 }, defects: {}, created_at: '2026-01-01', sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping!.isCVA).toBe(false)
    expect(out!.cupping!.cvaMinScore).toBeNull()
  })

  it('flags a defect-presence discrepancy when cuppers disagree on existence', async () => {
    // Cupper "Ana" reports a "woody" taint; cupper "Bob" does not → presence
    // discrepancy. Mirrors aggregate/route.ts "Only identified by ..." flag.
    const sample = {
      id: 'uuid-1',
      tracking_number: 'SAN-1',
      deleted_at: null,
      client_id: 'c1',
      end_client_id: null,
      quality_spec_id: null,
    }
    const client = fakeClient({
      samples: sample,
      cupping_sessions: { id: 'sess-1', cupper_ids: ['a', 'b'], master_cupper_id: null },
      cupping_scores: [
        { id: 's1', cupper_id: 'a', scores: { Acidity: 8 }, defects: { taints: ['woody'] }, created_at: '2026-01-01', cupper: { id: 'a', full_name: 'Ana' }, sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
        { id: 's2', cupper_id: 'b', scores: { Acidity: 8 }, defects: { taints: [] }, created_at: '2026-01-01', cupper: { id: 'b', full_name: 'Bob' }, sample: { id: 'uuid-1', tracking_number: 'SAN-1' } },
      ],
    })
    const out = await aggregateQuadrant(client as any, 'uuid-1')
    expect(out!.cupping!.hasDiscrepancies).toBe(true)
    expect(out!.cupping!.discrepancy_flags).toContain(
      'Defect (Taint) "woody": Only identified by Ana (1/2 cuppers)'
    )
  })
})

describe('loadSampleOwnership', () => {
  it('returns null when sample is missing', async () => {
    const out = await loadSampleOwnership(fakeClient({}) as any, 'uuid-1')
    expect(out).toBeNull()
  })

  it('returns null when sample is soft-deleted', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        client_id: 'c1',
        end_client_id: null,
        deleted_at: '2026-01-01T00:00:00Z',
      },
    })
    const out = await loadSampleOwnership(client as any, 'uuid-1')
    expect(out).toBeNull()
  })

  it('returns client_id and end_client_id for a live sample', async () => {
    const client = fakeClient({
      samples: {
        id: 'uuid-1',
        client_id: 'c1',
        end_client_id: 'ec1',
        deleted_at: null,
      },
    })
    const out = await loadSampleOwnership(client as any, 'uuid-1')
    expect(out).toEqual({ client_id: 'c1', end_client_id: 'ec1' })
  })
})
