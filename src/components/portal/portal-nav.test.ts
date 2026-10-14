import { describe, expect, it } from 'vitest'
import { visibleNav } from './portal-nav'

describe('visibleNav', () => {
  it('shows only the pages the keys allow, and Team only to company admins', () => {
    expect(visibleNav({ keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false }).map((i) => i.label))
      .toEqual(['Overview', 'Certificates'])
    expect(visibleNav({ keys: { views: ['qc_samples', 'qc_certificates'], capabilities: [] }, isCompanyAdmin: true }).map((i) => i.label))
      .toEqual(['Overview', 'Contracts', 'Samples', 'Certificates', 'Team'])
  })
})
