import { describe, expect, it } from 'vitest'
import { resolveFlavorDescriptor } from './certificate-data'

describe('resolveFlavorDescriptor', () => {
  it('uses a non-empty override verbatim (trimmed) over the aggregate', () => {
    expect(resolveFlavorDescriptor('  Strictly Soft  ', ['Soft', 'Soft'])).toBe('Strictly Soft')
  })

  it('treats an explicit empty-string override as intentionally blank (no fallback)', () => {
    // Regression: clearing the cup profile must stay cleared and NOT re-derive the
    // aggregated descriptor on the certificate.
    expect(resolveFlavorDescriptor('', ['Soft', 'Soft', 'Hard'])).toBeNull()
  })

  it('treats a whitespace-only override as intentionally blank', () => {
    expect(resolveFlavorDescriptor('   ', ['Soft'])).toBeNull()
  })

  it('falls back to the most common aggregated descriptor when there is no override', () => {
    expect(resolveFlavorDescriptor(null, ['Soft', 'Hard', 'Soft'])).toBe('Soft')
    expect(resolveFlavorDescriptor(undefined, ['Hard', 'Hard', 'Soft'])).toBe('Hard')
  })

  it('returns null when there is neither an override nor any aggregated descriptor', () => {
    expect(resolveFlavorDescriptor(null, [])).toBeNull()
    expect(resolveFlavorDescriptor(undefined, [])).toBeNull()
  })
})
