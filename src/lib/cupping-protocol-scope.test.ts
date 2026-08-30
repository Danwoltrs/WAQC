import { describe, it, expect } from 'vitest'
import {
  cvaSampleIds,
  excludeCvaScores,
  excludeCvaSessions,
  excludeRosterSessions,
  isCvaScoreRow,
} from './cupping-protocol-scope'

/** Records the filters a chain was asked for, then hands the chain back. */
function spyBuilder() {
  const calls: Array<[string, unknown[]]> = []
  const chain: any = {
    calls,
    neq: (...args: unknown[]) => { calls.push(['neq', args]); return chain },
    or: (...args: unknown[]) => { calls.push(['or', args]); return chain },
  }
  return chain
}

describe('excludeCvaSessions', () => {
  it('filters the CVA session type out and stays chainable', () => {
    const b = spyBuilder()
    expect(excludeCvaSessions(b)).toBe(b)
    expect(b.calls).toEqual([['neq', ['session_type', 'cva']]])
  })
})

describe('excludeRosterSessions', () => {
  it('filters the roster status out and stays chainable', () => {
    // A roster ('cva' + 'setup') holds who is assigned and no scores at all.
    // Handing one to the journey or to finalize certifies a lot off a session
    // that has nothing in it.
    const b = spyBuilder()
    expect(excludeRosterSessions(b)).toBe(b)
    expect(b.calls).toEqual([['neq', ['status', 'setup']]])
  })
})

describe('excludeCvaScores', () => {
  it('keeps rows whose protocol is null or is not cva', () => {
    const b = spyBuilder()
    expect(excludeCvaScores(b)).toBe(b)
    expect(b.calls).toEqual([['or', ['protocol.is.null,protocol.neq.cva']]])
  })

  it('keeps the commodity rows, which carry no protocol at all', () => {
    // The null branch is what actually matches today — every commodity write
    // leaves protocol unset, so a filter of `protocol.neq.cva` alone would
    // discard every real row (SQL: NULL <> 'cva' is NULL, not true).
    expect(isCvaScoreRow({ protocol: null })).toBe(false)
    expect(isCvaScoreRow({})).toBe(false)
    expect(isCvaScoreRow(undefined)).toBe(false)
  })

  it('identifies a specialty row', () => {
    expect(isCvaScoreRow({ protocol: 'cva' })).toBe(true)
  })
})

/**
 * A stand-in for the Supabase builder, keyed by table. Each table answers one
 * `.select().in()` (plus an optional `.eq()`) — exactly the shape cvaSampleIds
 * uses to walk sample -> quality -> template.
 */
function fakeDb(tables: Record<string, { rows: any[]; error?: { message: string } }>) {
  return {
    from(table: string) {
      const entry = tables[table] ?? { rows: [] }
      const filters: Array<(r: any) => boolean> = []
      const builder: any = {
        select: () => builder,
        in: (col: string, values: any[]) => { filters.push((r) => values.includes(r[col])); return builder },
        eq: (col: string, value: any) => { filters.push((r) => r[col] === value); return builder },
        then: (resolve: (v: any) => void) =>
          resolve(entry.error
            ? { data: null, error: entry.error }
            : { data: entry.rows.filter((r) => filters.every((f) => f(r))), error: null }),
      }
      return builder
    },
  }
}

const WORLD = {
  samples: { rows: [
    { id: 'spec-1', quality_spec_id: 'q-cva' },
    { id: 'com-1', quality_spec_id: 'q-com' },
    { id: 'none-1', quality_spec_id: null },
  ] },
  client_qualities: { rows: [
    { id: 'q-cva', template_id: 't-cva' },
    { id: 'q-com', template_id: 't-com' },
  ] },
  quality_templates: { rows: [
    { id: 't-cva', methodology: 'cva' },
    { id: 't-com', methodology: 'commodity' },
  ] },
}

describe('cvaSampleIds', () => {
  it('picks out the lots whose quality sits on a CVA template', async () => {
    // The miss that put SAN-00762/26 on the commodity grid: being specialty is
    // a property of the QUALITY, so it can only be resolved through the
    // template — nothing on the sample row says so.
    expect(await cvaSampleIds(fakeDb(WORLD), ['spec-1', 'com-1', 'none-1'])).toEqual(new Set(['spec-1']))
  })

  it('leaves a commodity-only assignment untouched', async () => {
    expect(await cvaSampleIds(fakeDb(WORLD), ['com-1'])).toEqual(new Set())
  })

  it('treats a sample with no quality as commodity rather than guessing', async () => {
    expect(await cvaSampleIds(fakeDb(WORLD), ['none-1'])).toEqual(new Set())
  })

  it('asks nothing of the database for an empty list', async () => {
    expect(await cvaSampleIds(fakeDb({}), [])).toEqual(new Set())
  })

  it('throws rather than reporting "no specialty lots" when a query fails', async () => {
    // Failing OPEN would route specialty lots straight onto the commodity grid
    // — the very bug this guards. The caller turns the throw into a 500.
    const broken = fakeDb({ ...WORLD, samples: { rows: [], error: { message: 'boom' } } })
    await expect(cvaSampleIds(broken, ['spec-1'])).rejects.toThrow(/boom/)
  })
})
