// src/lib/portal/portal-me.ts
import { companyDisplayName } from '@/lib/contract-intake-mapping'
import { hasQcView, isCompanyAdmin, qcKeysOf, type QcKeySet } from './qc-keys'

export interface PortalCompany {
  id: string
  name: string
  keys: QcKeySet
  isCompanyAdmin: boolean
}

export interface PortalMe {
  kind: 'external' | 'staff'
  fullName: string | null
  email: string | null
  companies: PortalCompany[]
  viewAs: boolean
}

/**
 * The portal identity of an external user: one entry per company whose
 * qc_portal_access row holds a QC view. sys's company grants play no part.
 */
export function buildExternalMe(profile: { full_name: string | null; email: string | null }, rows: any[]): PortalMe {
  const companies = rows
    .filter(hasQcView)
    .map((g) => ({
      id: g.company_id as string,
      name: companyDisplayName(g.companies ?? null) || 'Company',
      keys: qcKeysOf(g),
      isCompanyAdmin: isCompanyAdmin(g),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { kind: 'external', fullName: profile.full_name, email: profile.email, companies, viewAs: false }
}
