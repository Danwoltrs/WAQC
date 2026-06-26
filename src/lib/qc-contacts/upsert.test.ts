import { describe, it, expect } from 'vitest'
import { planQcUpsert } from './upsert'
import type { QcContactRecord } from './tags'

const existing = (over: Partial<QcContactRecord>): QcContactRecord => ({
  id: 'c1', company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost', nickname: null,
  phone: null, whatsapp: null, preferred_language: null, is_group: false,
  is_primary: null, is_active: true, routing_purposes: ['shipping_documents'], ...over,
})

const input = {
  email: 'joost@ahold.nl', name: 'Joost Pollmann', nickname: 'Joost',
  isGroup: false, phone: '+31', whatsapp: null, preferredLanguage: 'en',
}

describe('planQcUpsert', () => {
  it('plans an INSERT (tagged) when no contact exists', () => {
    const plan = planQcUpsert(null, 'co1', input, 'user1')
    expect(plan.kind).toBe('insert')
    if (plan.kind !== 'insert') return
    expect(plan.values).toMatchObject({
      company_id: 'co1', email: 'joost@ahold.nl', name: 'Joost Pollmann',
      is_group: false, is_active: true, routing_purposes: ['qc_certificates'], created_by: 'user1',
    })
  })

  it('derives name from the email local-part when none is given', () => {
    const plan = planQcUpsert(null, 'co1', { email: 'team@ahold.nl', isGroup: true }, null)
    if (plan.kind !== 'insert') throw new Error('expected insert')
    expect(plan.values.name).toBe('team')
    expect(plan.values.is_group).toBe(true)
  })

  it('plans an UPDATE that unions the tag and preserves other purposes', () => {
    const plan = planQcUpsert(existing({}), 'co1', input, 'user1')
    expect(plan.kind).toBe('update')
    if (plan.kind !== 'update') return
    expect(plan.id).toBe('c1')
    expect(plan.values.routing_purposes).toEqual(['shipping_documents', 'qc_certificates'])
    expect(plan.values.is_active).toBe(true)
  })

  it('reactivates a deactivated contact on re-add', () => {
    const plan = planQcUpsert(existing({ is_active: false }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_active).toBe(true)
  })

  it('fills only BLANK fields and never clobbers an existing name', () => {
    const plan = planQcUpsert(existing({ name: 'Existing Name', phone: null }), 'co1', input, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.name).toBeUndefined() // existing non-blank name kept
    expect(plan.values.phone).toBe('+31')    // blank phone filled
  })

  it('does not flip an existing person/group kind', () => {
    const plan = planQcUpsert(existing({ is_group: false }), 'co1', { ...input, isGroup: true }, 'user1')
    if (plan.kind !== 'update') throw new Error('expected update')
    expect(plan.values.is_group).toBeUndefined()
  })
})
