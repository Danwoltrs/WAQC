import { describe, it, expect } from 'vitest'
import { isAbortError, latestRequestGate } from './latest-request'

describe('latestRequestGate', () => {
  it('lets only the newest request land and aborts the one it supersedes', () => {
    const gate = latestRequestGate()
    const unfiltered = gate.begin()
    const search = gate.begin()
    expect(unfiltered.signal.aborted).toBe(true)
    expect(unfiltered.isLatest()).toBe(false)
    expect(search.signal.aborted).toBe(false)
    expect(search.isLatest()).toBe(true)
  })

  it('recognises an aborted fetch', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(new Error('boom'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
