import { describe, it, expect } from 'vitest'
import {
  PURPOSE_GROUPS, QC_EDITABLE_PURPOSES, isQcEditablePurpose, setPurpose, mergePeople,
  portalAccessLabel, departments, type PersonContact,
} from './people'
import type { QcMember } from '@/lib/portal/qc-grants'
import type { InvitationSummary } from '@/lib/portal/portal-invitations'

const contact = (p: Partial<PersonContact>): PersonContact => ({
  id: 'c1', name: 'Quality team', nickname: null, email: 'quality@bennett.example', phone: null, whatsapp: null,
  preferred_language: 'en', role: 'QC', is_group: true, is_primary: false, routing_purposes: [], ...p,
})
const member = (p: Partial<QcMember>): QcMember => ({
  userId: 'u1', email: 'buyer@bennett.example', fullName: 'Green Buyer', status: 'active',
  keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: false, lastSignInAt: null, ...p,
})
const invite = (p: Partial<InvitationSummary>): InvitationSummary => ({
  id: 'i1', email: 'roaster@bennett.example', firstName: 'Head', lastName: 'Roaster',
  keys: { views: ['qc_samples'], capabilities: [] }, isCompanyAdmin: false, invitedByKind: 'staff',
  expiresAt: '2026-11-16T00:00:00Z', createdAt: '2026-11-09T00:00:00Z', ...p,
})

describe('purpose groups', () => {
  it('lists every sys purpose exactly once', () => {
    const all = PURPOSE_GROUPS.flatMap((g) => g.purposes.map((p) => p.value))
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(12)
  })
  it('lets QC edit only the Quality columns', () => {
    expect(QC_EDITABLE_PURPOSES).toEqual(['sample_requests', 'sample_approvals', 'qc_certificates', 'eudr_files'])
    expect(isQcEditablePurpose('qc_certificates')).toBe(true)
    expect(isQcEditablePurpose('fixation_letters')).toBe(false)
    expect(isQcEditablePurpose(42)).toBe(false)
  })
})

describe('setPurpose', () => {
  it('adds without touching other tags', () => {
    expect(setPurpose(['fixation_letters'], 'qc_certificates', true)).toEqual(['fixation_letters', 'qc_certificates'])
  })
  it('never duplicates and keeps the position', () => {
    expect(setPurpose(['qc_certificates', 'price_report'], 'qc_certificates', true)).toEqual(['qc_certificates', 'price_report'])
  })
  it('removes only that tag', () => {
    expect(setPurpose(['sale_confirmations', 'qc_certificates', 'eudr_files'], 'qc_certificates', false))
      .toEqual(['sale_confirmations', 'eudr_files'])
  })
  it('handles null', () => {
    expect(setPurpose(null, 'eudr_files', true)).toEqual(['eudr_files'])
    expect(setPurpose(null, 'eudr_files', false)).toEqual([])
  })
})

describe('mergePeople', () => {
  it('puts portal access on the contact row with the same email, case-insensitively', () => {
    const rows = mergePeople(
      [contact({ id: 'c2', name: 'Green buying', email: 'Buyer@Bennett.example', is_group: false })],
      [member({})],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].contact?.id).toBe('c2')
    expect(rows[0].member?.userId).toBe('u1')
  })

  it('adds portal members and invitations that are not contacts, after the contacts', () => {
    const rows = mergePeople([contact({})], [member({})], [invite({})])
    expect(rows.map((r) => r.key)).toEqual(['c:c1', 'm:u1', 'i:i1'])
    expect(rows[2].name).toBe('Head Roaster')
  })

  it('shows an invitation on its contact row, but not when the person is already a member', () => {
    const rows = mergePeople(
      [contact({ id: 'c3', email: 'roaster@bennett.example' })],
      [],
      [invite({})],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].invitation?.id).toBe('i1')
  })

  it('orders contacts primary first, then by name', () => {
    const rows = mergePeople([
      contact({ id: 'a', name: 'Zed', email: 'z@x.example' }),
      contact({ id: 'b', name: 'Amy', email: 'a@x.example' }),
      contact({ id: 'c', name: 'Primary', email: 'p@x.example', is_primary: true }),
    ], [], [])
    expect(rows.map((r) => r.contact?.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('portalAccessLabel', () => {
  it('names a preset, in any key order', () => {
    expect(portalAccessLabel({ views: ['qc_cupping', 'qc_samples', 'qc_certificates'], capabilities: ['qc_cupping_score'] }))
      .toBe('Cupper access')
  })
  it('falls back to custom', () => {
    expect(portalAccessLabel({ views: ['qc_samples'], capabilities: [] })).toBe('Custom access')
  })
})

describe('departments', () => {
  it('splits the comma-joined sys role', () => {
    expect(departments(' QC, Trading ,')).toEqual(['QC', 'Trading'])
    expect(departments(null)).toEqual([])
  })
})
