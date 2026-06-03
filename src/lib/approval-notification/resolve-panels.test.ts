import { describe, it, expect } from 'vitest'
import { resolvePanel, type ContactRow } from './resolve-panels'

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
  it('puts the sample_approvals contact in TO and greets by nickname', () => {
    const rows = [
      row({ email: 'reg@buyer.com', name: 'Regula Heiniger', nickname: 'Regula', routing_purposes: ['sample_approvals'] }),
      row({ email: 'other@buyer.com', name: 'Other', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['reg@buyer.com'])
    expect(p.greeting).toBe('Regula')
    expect(p.cc.some((c) => c.email === QC)).toBe(true)
  })

  it('falls back to is_primary, then first, when no sample_approvals tag', () => {
    const rows = [
      row({ email: 'first@buyer.com', name: 'First' }),
      row({ email: 'prim@buyer.com', name: 'Primary', is_primary: true }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to.map((c) => c.email)).toEqual(['prim@buyer.com'])
    expect(p.greeting).toBe('Primary')
  })

  it('drops TO entirely when every candidate is internal', () => {
    const rows = [row({ email: 'staff@wolthers.com', name: 'Staff', routing_purposes: ['sample_approvals'] })]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.to).toEqual([])
    expect(p.greeting).toBe('Blaser team')
  })

  it('routes group mailboxes to CC and skips them for greeting', () => {
    const rows = [
      row({ email: 'docs@buyer.com', name: 'Docs', is_group_mailbox: true, routing_purposes: ['sample_approvals'] }),
      row({ email: 'reg@buyer.com', name: 'Regula', nickname: 'Reg', routing_purposes: ['sample_approvals'] }),
    ]
    const p = resolvePanel(rows, 'C1', 'Blaser', QC)
    expect(p.greeting).toBe('Reg')
    expect(p.cc.some((c) => c.email === 'docs@buyer.com')).toBe(true)
  })

  it('returns only the QC mailbox in CC when companyId is null', () => {
    const p = resolvePanel([], null, null, QC)
    expect(p.to).toEqual([])
    expect(p.cc).toEqual([{ email: QC, name: 'Quality Control', nickname: null, isGroupMailbox: false }])
    expect(p.greeting).toBe('team')
  })
})
