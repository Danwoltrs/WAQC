import { describe, it, expect } from 'vitest'
import { excludeCvaScores, excludeCvaSessions, isCvaScoreRow } from './cupping-protocol-scope'

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
