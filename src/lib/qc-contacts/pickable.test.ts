import { describe, it, expect } from 'vitest'
import { toPickableContacts, type RawContactRow } from './pickable'

const row = (over: Partial<RawContactRow> = {}): RawContactRow => ({
  id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl',
  is_group: false, is_active: true, routing_purposes: ['sale_confirmation'], ...over,
})

describe('toPickableContacts', () => {
  it('maps a normal contact to camelCase shape', () => {
    expect(toPickableContacts([row()])).toEqual([
      { id: 'c1', name: 'Joost Pollmann', nickname: 'Joost', email: 'joost@ahold.nl', isGroup: false },
    ])
  })

  it('excludes contacts already tagged qc_certificates', () => {
    const tagged = row({ id: 'c2', email: 'qc@ahold.nl', routing_purposes: ['qc_certificates', 'sale_confirmation'] })
    expect(toPickableContacts([row(), tagged]).map((c) => c.id)).toEqual(['c1'])
  })

  it('excludes internal @wolthers.com addresses', () => {
    const internal = row({ id: 'c3', email: 'anderson@wolthers.com' })
    expect(toPickableContacts([row(), internal]).map((c) => c.id)).toEqual(['c1'])
  })

  it('drops rows with no email', () => {
    const noEmail = row({ id: 'c4', email: null })
    expect(toPickableContacts([row(), noEmail]).map((c) => c.id)).toEqual(['c1'])
  })

  it('drops inactive rows', () => {
    const inactive = row({ id: 'c5', email: 'old@ahold.nl', is_active: false })
    expect(toPickableContacts([row(), inactive]).map((c) => c.id)).toEqual(['c1'])
  })

  it('orders by name then email, case-insensitive', () => {
    const rows = [
      row({ id: 'b', name: 'Bravo', email: 'b@x.com' }),
      row({ id: 'a', name: 'alpha', email: 'a@x.com' }),
      row({ id: 'n', name: '', email: 'zed@x.com' }),
    ]
    expect(toPickableContacts(rows).map((c) => c.id)).toEqual(['a', 'b', 'n'])
  })

  it('null routing_purposes is treated as untagged (included)', () => {
    expect(toPickableContacts([row({ routing_purposes: null })]).map((c) => c.id)).toEqual(['c1'])
  })
})
