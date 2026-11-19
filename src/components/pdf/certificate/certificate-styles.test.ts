import { describe, it, expect } from 'vitest'
import { getStatusText } from './certificate-styles'

describe('the certificate header status', () => {
  it('prints the verdict for a lot', () => {
    expect(getStatusText('approved', 'pss')).toBe('APPROVED')
    expect(getStatusText('rejected', 'ss')).toBe('REJECTED')
    expect(getStatusText('approved')).toBe('APPROVED')
  })

  it('prints the range, not a verdict, for a type sample', () => {
    expect(getStatusText('approved', 'type')).toBe('IN RANGE')
    expect(getStatusText('rejected', 'type')).toBe('OUT OF RANGE')
  })

  it('leaves an undecided status as it was', () => {
    expect(getStatusText(null, 'type')).toBe('PENDING')
    expect(getStatusText('in_progress')).toBe('IN_PROGRESS')
  })
})
