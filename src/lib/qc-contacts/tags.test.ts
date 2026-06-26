import { describe, it, expect } from 'vitest'
import {
  hasQcCertTag,
  addQcCertTag,
  removeQcCertTag,
  isInternalEmail,
  splitQcContacts,
  type QcContactRecord,
} from './tags'

const rec = (over: Partial<QcContactRecord>): QcContactRecord => ({
  id: 'id', company_id: 'co', email: 'a@x.com', name: 'A', nickname: null,
  phone: null, whatsapp: null, preferred_language: null, is_group: false,
  is_primary: null, is_active: true, routing_purposes: ['qc_certificates'], ...over,
})

describe('qc-cert tag helpers', () => {
  it('hasQcCertTag detects the tag and tolerates null', () => {
    expect(hasQcCertTag(['qc_certificates'])).toBe(true)
    expect(hasQcCertTag(['shipping_documents'])).toBe(false)
    expect(hasQcCertTag(null)).toBe(false)
  })

  it('addQcCertTag unions without duplicating and preserves other tags', () => {
    expect(addQcCertTag(['shipping_documents'])).toEqual(['shipping_documents', 'qc_certificates'])
    expect(addQcCertTag(['qc_certificates'])).toEqual(['qc_certificates'])
    expect(addQcCertTag(null)).toEqual(['qc_certificates'])
  })

  it('removeQcCertTag removes ONLY the qc tag', () => {
    expect(removeQcCertTag(['qc_certificates', 'fixation_letters'])).toEqual(['fixation_letters'])
    expect(removeQcCertTag(['fixation_letters'])).toEqual(['fixation_letters'])
    expect(removeQcCertTag(null)).toEqual([])
  })

  it('isInternalEmail flags @wolthers.com only', () => {
    expect(isInternalEmail('anderson@wolthers.com')).toBe(true)
    expect(isInternalEmail('buyer@ahold.nl')).toBe(false)
    expect(isInternalEmail(null)).toBe(false)
  })

  it('splitQcContacts separates people/groups, primary-first then name', () => {
    const rows = [
      rec({ id: 'p2', is_group: false, is_primary: false, name: 'Zed' }),
      rec({ id: 'p1', is_group: false, is_primary: true, name: 'Bob' }),
      rec({ id: 'g1', is_group: true, name: 'Inbox' }),
    ]
    const { people, groups } = splitQcContacts(rows)
    expect(people.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(groups.map((g) => g.id)).toEqual(['g1'])
  })
})
