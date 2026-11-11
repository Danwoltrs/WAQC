import { describe, it, expect } from 'vitest'
import { cancelledChangesNotice } from './cancelled-notice'

describe('cancelledChangesNotice', () => {
  it('tells staff which scheduled client change their save cancelled', () => {
    expect(cancelledChangesNotice([{ versionNo: 3, effectiveFrom: '2026-12-01' }])).toBe(
      "This save cancelled the client's change scheduled from 1 December 2026 (version 3). Head office and the labs were emailed.",
    )
  })
  it('lists several', () => {
    expect(cancelledChangesNotice([
      { versionNo: 3, effectiveFrom: '2026-12-01' },
      { versionNo: 5, effectiveFrom: '2027-01-15' },
    ])).toBe(
      "This save cancelled the client's changes scheduled from 1 December 2026 (version 3) and 15 January 2027 (version 5). Head office and the labs were emailed.",
    )
  })
  it('is null when nothing was cancelled or the field is missing', () => {
    expect(cancelledChangesNotice([])).toBeNull()
    expect(cancelledChangesNotice(undefined)).toBeNull()
    expect(cancelledChangesNotice('x' as any)).toBeNull()
  })
})
