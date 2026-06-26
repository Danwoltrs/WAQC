// Test runner: npx vitest run src/lib/embed/quadrant-aggregate.test.ts
// (project uses vitest — see package.json scripts.test and vitest.config.ts)

import { describe, it, expect } from 'vitest'
import { aggregateQuadrant, loadSampleOwnership } from './quadrant-aggregate'

// Minimal Supabase query-builder stub.
// Supports: .from(table).select(...).eq(...).is(...).maybeSingle()
// and       .from(table).select(...).eq(...).then(cb)
function fakeClient(rows: Record<string, any>) {
  return {
    from(table: string) {
      const builder: any = {
        _table: table,
        select() { return builder },
        eq() { return builder },
        is() { return builder },
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
    expect(out!.qualityAssessment.green_bean_data.moisture).toBe(11)
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
