// src/lib/portal/portal-me.test.ts
import { describe, expect, it } from 'vitest'
import { buildExternalMe } from './portal-me'

describe('buildExternalMe', () => {
  it('lists only companies whose QC access row holds a QC view, by fantasy name, with keys and the QC admin flag', () => {
    const me = buildExternalMe({ full_name: 'Ana Lima', email: 'ana@client.com' }, [
      { company_id: 'b', views: ['qc_samples'], capabilities: ['qc_manage_users'], companies: { id: 'b', name: 'Zeta Ltda', fantasy_name: 'Beta Roasters' } },
      { company_id: 'c', views: [], capabilities: ['qc_spec_edit'], companies: { id: 'c', name: 'No View SA', fantasy_name: null } },
      { company_id: 'a', views: ['qc_certificates'], capabilities: [], companies: { id: 'a', name: 'Alpha Coffee SA', fantasy_name: '' } },
    ])
    expect(me).toEqual({
      kind: 'external', fullName: 'Ana Lima', email: 'ana@client.com', viewAs: false,
      companies: [
        { id: 'a', name: 'Alpha Coffee SA', keys: { views: ['qc_certificates'], capabilities: [] }, isCompanyAdmin: false },
        { id: 'b', name: 'Beta Roasters', keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: true },
      ],
    })
  })
})
