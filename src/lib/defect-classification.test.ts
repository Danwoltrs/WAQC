import { describe, it, expect } from 'vitest'
import { isPrimaryDefect, PRIMARY_DEFECTS } from './defect-classification'

describe('isPrimaryDefect', () => {
  it('matches the certificate\'s primary list case-insensitively, as a substring', () => {
    expect(isPrimaryDefect('Full Black')).toBe(true)
    expect(isPrimaryDefect('full black beans')).toBe(true)
    expect(isPrimaryDefect('Fungus Damaged')).toBe(true)
    expect(isPrimaryDefect('Dried Cherry/Pod')).toBe(true)
  })

  it('treats everything else as secondary, Severe Broca included', () => {
    expect(isPrimaryDefect('Severe Broca')).toBe(false)
    expect(isPrimaryDefect('Broken/Chipped')).toBe(false)
    expect(isPrimaryDefect('Immature')).toBe(false)
  })

  it('keeps the list the certificate has always printed', () => {
    expect(PRIMARY_DEFECTS).toEqual([
      'Full Black', 'Full Sour', 'Pod/Cherry', 'Large Husk',
      'Stone/Stick', 'Foreign Material',
      'Dried Cherry', 'Fungus Damage', 'Severe Insect Damage', 'Foreign Matter',
    ])
  })
})
