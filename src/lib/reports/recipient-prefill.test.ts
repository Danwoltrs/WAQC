import { describe, it, expect } from 'vitest'
import { buildToList } from './recipient-prefill'
import type { QcContactRecord } from '@/lib/qc-contacts/tags'

function contact(over: Partial<QcContactRecord> & { id: string }): QcContactRecord {
  return {
    id: over.id,
    company_id: 'co1',
    email: over.email ?? `${over.id}@ahold.nl`,
    name: over.name ?? '',
    nickname: over.nickname ?? null,
    phone: null,
    whatsapp: null,
    preferred_language: 'en',
    is_group: over.is_group ?? false,
    is_primary: over.is_primary ?? null,
    is_active: true,
    routing_purposes: ['qc_certificates'],
  }
}

describe('buildToList', () => {
  it('maps contacts to recipients, preserving the given order', () => {
    const out = buildToList(
      [
        contact({ id: 'c1', email: 'marieke@ahold.nl', name: 'Marieke de Vries' }),
        contact({ id: 'c2', email: 'qc@ahold.nl', name: 'QC Team', is_group: true }),
      ],
      [],
    )
    expect(out).toEqual([
      { email: 'marieke@ahold.nl', name: 'Marieke de Vries', isGroup: false, contactId: 'c1', source: 'contact' },
      { email: 'qc@ahold.nl', name: 'QC Team', isGroup: true, contactId: 'c2', source: 'contact' },
    ])
  })

  it('appends last-send addresses after the contacts', () => {
    const out = buildToList([contact({ id: 'c1', email: 'marieke@ahold.nl', name: 'Marieke' })], [
      'jan.bakker@ahold.nl',
    ])
    expect(out.map((r) => r.email)).toEqual(['marieke@ahold.nl', 'jan.bakker@ahold.nl'])
    expect(out[1]).toEqual({
      email: 'jan.bakker@ahold.nl',
      name: null,
      isGroup: false,
      contactId: null,
      source: 'last_send',
    })
  })

  it('de-duplicates case-insensitively, first casing wins', () => {
    const out = buildToList([contact({ id: 'c1', email: 'Marieke@Ahold.nl', name: 'Marieke' })], [
      'marieke@ahold.nl',
    ])
    expect(out).toHaveLength(1)
    expect(out[0].email).toBe('Marieke@Ahold.nl')
    expect(out[0].source).toBe('contact')
  })

  it('de-duplicates repeats within the last-send list too', () => {
    const out = buildToList([], ['a@x.com', 'A@X.com'])
    expect(out.map((r) => r.email)).toEqual(['a@x.com'])
  })

  it('drops internal contacts but keeps internal last-send addresses', () => {
    const out = buildToList(
      [
        contact({ id: 'c1', email: 'daniel@wolthers.com', name: 'Daniel' }),
        contact({ id: 'c2', email: 'marieke@ahold.nl', name: 'Marieke' }),
      ],
      ['qualitycontrol@wolthers.com'],
    )
    expect(out.map((r) => r.email)).toEqual(['marieke@ahold.nl', 'qualitycontrol@wolthers.com'])
  })

  it('drops contacts with a blank or missing email', () => {
    const out = buildToList(
      [contact({ id: 'c1', email: '   ', name: 'Blank' }), contact({ id: 'c2', email: 'ok@ahold.nl', name: 'Ok' })],
      [],
    )
    expect(out.map((r) => r.email)).toEqual(['ok@ahold.nl'])
  })

  it('trims whitespace and skips blank last-send entries', () => {
    const out = buildToList([], ['  spaced@ahold.nl  ', '', '   '])
    expect(out.map((r) => r.email)).toEqual(['spaced@ahold.nl'])
  })

  it('normalises a blank contact name to null', () => {
    const out = buildToList([contact({ id: 'c1', email: 'x@ahold.nl', name: '   ' })], [])
    expect(out[0].name).toBeNull()
  })

  it('returns an empty list when both sources are empty', () => {
    expect(buildToList([], [])).toEqual([])
  })
})
