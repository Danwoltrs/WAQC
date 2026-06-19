import { describe, it, expect } from 'vitest'
import { resolvePanel, HOUSE_CC, type ContactRow } from './resolve-panels'

const QC = 'qualitycontrol@wolthers.com'

const row = (over: Partial<ContactRow>): ContactRow => ({
  company_id: 'C1',
  email: 'a@x.com',
  name: 'A',
  nickname: null,
  role: null,
  is_primary: false,
  is_group_mailbox: false,
  routing_purposes: [],
  ...over,
})

describe('resolvePanel', () => {
  it('puts the qc_certificates contact in TO and greets by nickname', () => {
    const rows = [
      row({ email: 'reg@buyer.com', name: 'Regula Heiniger', nickname: 'Regula', routing_purposes: ['qc_certificates'] }),
      row({ email: 'other@buyer.com', name: 'Other', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['reg@buyer.com'])
    expect(p.greeting).toBe('Regula')
    expect(p.cc.some((c) => c.email === QC)).toBe(true)
    expect(p.cc.some((c) => c.email === HOUSE_CC)).toBe(true)
  })

  it('does NOT fall back to a primary/first contact when none are tagged', () => {
    const rows = [
      row({ email: 'first@buyer.com', name: 'First' }),
      row({ email: 'prim@buyer.com', name: 'Primary', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to).toEqual([])
    expect(p.greeting).toBe('Blaser team')
    // House office + QC mailbox are still copied.
    expect(p.cc.map((c) => c.email)).toEqual([QC, HOUSE_CC])
  })

  it('does NOT add untagged group mailboxes or logistics contacts to CC', () => {
    const rows = [
      row({ email: 'reg@buyer.com', name: 'Regula', nickname: 'Reg', routing_purposes: ['qc_certificates'] }),
      row({ email: 'docs@buyer.com', name: 'Docs', is_group_mailbox: true, routing_purposes: [] }),
      row({ email: 'logi@buyer.com', name: 'Logi', role: 'logistics', routing_purposes: [] }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['reg@buyer.com'])
    expect(p.cc.some((c) => c.email === 'docs@buyer.com')).toBe(false)
    expect(p.cc.some((c) => c.email === 'logi@buyer.com')).toBe(false)
  })

  it('drops TO entirely when every tagged candidate is internal', () => {
    const rows = [row({ email: 'staff@wolthers.com', name: 'Staff', routing_purposes: ['qc_certificates'] })]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to).toEqual([])
    expect(p.greeting).toBe('Blaser team')
  })

  it('promotes a tagged group inbox to TO when no individual is tagged', () => {
    const rows = [
      row({ email: 'backoffice@buyer.com', name: 'BT Backoffice', is_group_mailbox: true, routing_purposes: ['qc_certificates'] }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['backoffice@buyer.com'])
    expect(p.greeting).toBe('Blaser team') // group inbox skipped for greeting
  })

  it('routes a tagged group inbox to CC when an individual is also tagged', () => {
    const rows = [
      row({ email: 'backoffice@buyer.com', name: 'Backoffice', is_group_mailbox: true, routing_purposes: ['qc_certificates'] }),
      row({ email: 'reg@buyer.com', name: 'Regula', nickname: 'Reg', routing_purposes: ['qc_certificates'] }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['reg@buyer.com'])
    expect(p.greeting).toBe('Reg')
    expect(p.cc.some((c) => c.email === 'backoffice@buyer.com')).toBe(true)
  })

  it('returns QC mailbox + house office in CC when companyId is null', () => {
    const p = resolvePanel([], null, null, QC)
    expect(p.to).toEqual([])
    expect(p.cc.map((c) => c.email)).toEqual([QC, HOUSE_CC])
    expect(p.greeting).toBe('team')
  })
})
