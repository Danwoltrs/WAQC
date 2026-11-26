import { describe, expect, it } from 'vitest'
import { legacyClientTypeToCompanyTags } from '@/lib/qc-client-mapper'
import { QC_COMPANY_ROLES } from './roles'

describe('QC_COMPANY_ROLES', () => {
  it('never lists a role that drives sys access rules', () => {
    const all: readonly string[] = [
      ...QC_COMPANY_ROLES.clientTypes, ...QC_COMPANY_ROLES.companyTypes, ...QC_COMPANY_ROLES.tradingRoles,
    ]
    for (const forbidden of ['co_broker', 'freight_forwarder', 'internal_market']) expect(all).not.toContain(forbidden)
  })

  it('company_types and trading_roles are exactly what the form client types map to', () => {
    const mapped = legacyClientTypeToCompanyTags([...QC_COMPANY_ROLES.clientTypes])
    expect([...mapped.company_types].sort()).toEqual([...QC_COMPANY_ROLES.companyTypes].sort())
    expect([...mapped.trading_roles].sort()).toEqual([...QC_COMPANY_ROLES.tradingRoles].sort())
  })
})
