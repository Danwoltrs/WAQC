import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seededDb, type Row } from '@/lib/quality-spec/__fixtures__/seeded-db'

const m = vi.hoisted(() => ({ sendMail: vi.fn() }))
vi.mock('@/lib/graph/send', async (orig) => ({ ...(await orig<any>()), sendMail: m.sendMail }))

import { buildSpecChangeEmail, sendSpecChangeEmail } from './spec-change-email'
import { WOLTHERS_CANCEL_NOTE } from '@/lib/quality-spec/types'

const CO = '11111111-1111-4111-8111-111111111111'
const recent = () => new Date(Date.now() - 10 * 86_400_000).toISOString()
const longAgo = () => new Date(Date.now() - 400 * 86_400_000).toISOString()

const version = (over: Row): Row => ({
  client_quality_id: 'q1', source: 'client', note: null, created_by: 'u1', created_at: '2026-11-11T15:00:00Z',
  applied_at: null, notified_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null,
  ...over,
})
const spec = (parameters: Row) => ({ template: { parameters }, custom_parameters: null, cups_per_sample: null, discrepancy_threshold: null })

function seed(): Record<string, Row[]> {
  return {
    client_quality_versions: [
      version({ id: 'v1', version_no: 1, source: 'migration', created_by: null, effective_from: '2000-01-01', applied_at: '2026-01-01T00:00:00Z', spec: spec({ max_quakers: 8 }) }),
      version({ id: 'v2', version_no: 2, effective_from: '2026-11-20', cancelled_at: '2026-11-10T00:00:00Z', spec: spec({ max_quakers: 3 }) }),
      version({ id: 'v3', version_no: 3, effective_from: '2026-12-01', note: 'Tighter quakers, see SAN-01234/26', spec: spec({ max_quakers: 5 }) }),
      version({ id: 'w4', version_no: 4, source: 'wolthers', effective_from: '2026-11-11', spec: spec({ max_quakers: 5 }), client_quality_id: 'q9' }),
    ],
    client_qualities: [
      { id: 'q1', client_id: CO, custom_name: 'GC17', template: null, fee_price: 9.5 },
      { id: 'q2', client_id: CO, custom_name: 'Other quality', template: null },
    ],
    companies: [{ id: CO, name: 'Legal Name Ltda', fantasy_name: 'Fancy Coffee' }],
    user_profiles: [
      { id: 'u1', full_name: 'Ana Client', email: 'ana@client.com' },
      { id: 'u2', full_name: null, email: 'bob@client.com' },
      { id: 'staff-1', full_name: 'Lab Staff', email: 'lab@wolthers.com' },
    ],
    laboratories: [
      { id: 'L1', contact_email: 'santos@wolthers.com' },
      { id: 'L2', contact_email: 'WOLTHERS@wolthers.com' },
      { id: 'L3', contact_email: 'not-an-email' },
      { id: 'L4', contact_email: 'old@lab.com' },
      { id: 'L5', contact_email: 'deleted@lab.com' },
      { id: 'L6', contact_email: 'other@lab.com' },
      { id: 'L7', contact_email: null },
      { id: 'L8', contact_email: 'Santos@Wolthers.com' },
    ],
    samples: [
      { id: 's1', quality_spec_id: 'q1', laboratory_id: 'L1', created_at: recent(), deleted_at: null, tracking_number: 'SAN-01234/26' },
      { id: 's2', quality_spec_id: 'q1', laboratory_id: 'L2', created_at: recent(), deleted_at: null },
      { id: 's3', quality_spec_id: 'q1', laboratory_id: 'L3', created_at: recent(), deleted_at: null },
      { id: 's4', quality_spec_id: 'q1', laboratory_id: 'L4', created_at: longAgo(), deleted_at: null },
      { id: 's5', quality_spec_id: 'q1', laboratory_id: 'L5', created_at: recent(), deleted_at: recent() },
      { id: 's6', quality_spec_id: 'q2', laboratory_id: 'L6', created_at: recent(), deleted_at: null },
      { id: 's7', quality_spec_id: 'q1', laboratory_id: 'L7', created_at: recent(), deleted_at: null },
      { id: 's8', quality_spec_id: 'q1', laboratory_id: 'L8', created_at: recent(), deleted_at: null },
    ],
  }
}

beforeEach(() => {
  m.sendMail.mockReset().mockResolvedValue(undefined)
  vi.stubEnv('MICROSOFT_GRAPH_TEST_RECIPIENT', '')
})

describe('buildSpecChangeEmail', () => {
  const input = {
    clientName: 'Fancy Coffee', qualityName: 'GC17', versionNo: 3, effectiveFrom: '2026-12-01', changedBy: 'Ana Client',
    note: 'Tighter quakers', changes: [{ section: 'Moisture, density & quakers', path: 'max_quakers', before: '8', after: '5' }],
  }
  it('subject names the quality, the client and the date', () => {
    expect(buildSpecChangeEmail(input).subject).toBe('Quality specification changed: GC17 for Fancy Coffee, from 1 December 2026')
  })
  it('lists each change, who changed it and from when', () => {
    const mail = buildSpecChangeEmail(input)
    expect(mail.text).toContain('Moisture, density & quakers: max_quakers 8 → 5')
    expect(mail.text).toContain('Ana Client')
    expect(mail.text).toContain('1 December 2026')
    expect(mail.text).toContain('Tighter quakers')
    expect(mail.html).toContain('max_quakers')
    expect(mail.html).toContain('Ana Client')
  })
  it('never carries fee_ keys or SAN numbers', () => {
    const mail = buildSpecChangeEmail({
      ...input,
      note: 'Linked to SAN-01234/26 and R-SAN-00002/26',
      changes: [...input.changes, { section: 'Other', path: 'fee_price', before: '1', after: '2' }],
    })
    for (const part of [mail.subject, mail.text, mail.html]) {
      expect(part).not.toContain('fee_')
      expect(part).not.toMatch(/SAN-/)
    }
  })
  it('a cancellation says so', () => {
    const mail = buildSpecChangeEmail({ ...input, cancelled: true })
    expect(mail.subject).toBe('Quality specification change cancelled: GC17 for Fancy Coffee, from 1 December 2026')
    expect(mail.text).toContain('cancelled')
    expect(mail.text).toContain('Moisture, density & quakers: max_quakers 8 → 5')
  })
  it('a change Wolthers cancelled says a Wolthers change superseded it', () => {
    const mail = buildSpecChangeEmail({ ...input, changedBy: 'Lab Staff', cancelled: true, cancelledByWolthers: true })
    expect(mail.subject).toBe('Quality specification change cancelled: GC17 for Fancy Coffee, from 1 December 2026')
    expect(mail.text).toContain('Lab Staff changed the quality specification GC17 for Fancy Coffee at Wolthers')
    expect(mail.text).toContain('cancelled the client change scheduled from 1 December 2026 (version 3)')
    expect(mail.text).not.toContain('stays as it was')
  })
  it('escapes HTML', () => {
    const mail = buildSpecChangeEmail({ ...input, qualityName: '<b>GC</b>' })
    expect(mail.html).not.toContain('<b>GC</b>')
    expect(mail.html).toContain('&lt;b&gt;GC&lt;/b&gt;')
  })
})

describe('sendSpecChangeEmail', () => {
  it('goes to head office and the labs holding recent live samples of the quality, deduplicated and valid only', async () => {
    const db = seededDb(seed())
    expect(await sendSpecChangeEmail('v3', db as any)).toBe(true)
    expect(m.sendMail).toHaveBeenCalledTimes(1)
    const sent = m.sendMail.mock.calls[0][0]
    expect(sent.to).toEqual(['wolthers@wolthers.com', 'santos@wolthers.com'])
    expect(sent.mailbox).toBeTruthy()
    expect(sent.subject).toBe('Quality specification changed: GC17 for Fancy Coffee, from 1 December 2026')
    // The previous version is the highest one below that is not cancelled (v1: 8, not v2: 3).
    expect(sent.bodyText).toContain('max_quakers 8 → 5')
    expect(sent.bodyText).toContain('Ana Client')
    expect(JSON.stringify(sent)).not.toMatch(/SAN-|fee_/)
    expect(db.rows.client_quality_versions.find((v) => v.id === 'v3')!.notified_at).toBeTruthy()
  })

  it('a send failure returns false and leaves notified_at null', async () => {
    m.sendMail.mockRejectedValue(new Error('graph down'))
    const db = seededDb(seed())
    expect(await sendSpecChangeEmail('v3', db as any)).toBe(false)
    expect(db.rows.client_quality_versions.find((v) => v.id === 'v3')!.notified_at).toBeNull()
  })

  it('honours MICROSOFT_GRAPH_TEST_RECIPIENT', async () => {
    vi.stubEnv('MICROSOFT_GRAPH_TEST_RECIPIENT', 'tester@wolthers.com')
    await sendSpecChangeEmail('v3', seededDb(seed()) as any)
    const sent = m.sendMail.mock.calls[0][0]
    expect(sent.to).toEqual(['tester@wolthers.com'])
    expect(sent.subject.startsWith('[TEST] ')).toBe(true)
  })

  it('never emails a Wolthers or migration version', async () => {
    const db = seededDb(seed())
    expect(await sendSpecChangeEmail('w4', db as any)).toBe(false)
    expect(await sendSpecChangeEmail('v1', db as any)).toBe(false)
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('an unknown version returns false without sending', async () => {
    expect(await sendSpecChangeEmail('nope', seededDb(seed()) as any)).toBe(false)
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('does not send twice once notified', async () => {
    const rows = seed()
    rows.client_quality_versions.find((v) => v.id === 'v3')!.notified_at = '2026-11-11T12:00:00Z'
    expect(await sendSpecChangeEmail('v3', seededDb(rows) as any)).toBe(true)
    expect(m.sendMail).not.toHaveBeenCalled()
  })

  it('a version cancelled by a Wolthers change is emailed as such, named after the staff member', async () => {
    const rows = seed()
    Object.assign(rows.client_quality_versions.find((v) => v.id === 'v3')!, {
      cancelled_at: '2026-11-12T10:00:00Z', cancelled_by: 'staff-1', cancel_note: WOLTHERS_CANCEL_NOTE, notified_at: '2026-11-11T12:00:00Z',
    })
    expect(await sendSpecChangeEmail('v3', seededDb(rows) as any)).toBe(true)
    const sent = m.sendMail.mock.calls[0][0]
    expect(sent.to).toEqual(['wolthers@wolthers.com', 'santos@wolthers.com'])
    expect(sent.subject).toBe('Quality specification change cancelled: GC17 for Fancy Coffee, from 1 December 2026')
    expect(sent.bodyText).toContain('Lab Staff changed the quality specification GC17 for Fancy Coffee at Wolthers')
  })

  it('a cancelled version sends the cancellation, named after who cancelled, and leaves notified_at alone', async () => {
    const rows = seed()
    Object.assign(rows.client_quality_versions.find((v) => v.id === 'v3')!, {
      cancelled_at: '2026-11-12T10:00:00Z', cancelled_by: 'u2', cancel_note: 'Cancelled by bob@client.com', notified_at: '2026-11-11T12:00:00Z',
    })
    const db = seededDb(rows)
    expect(await sendSpecChangeEmail('v3', db as any)).toBe(true)
    const sent = m.sendMail.mock.calls[0][0]
    expect(sent.subject).toBe('Quality specification change cancelled: GC17 for Fancy Coffee, from 1 December 2026')
    expect(sent.bodyText).toContain('bob@client.com')
    expect(db.rows.client_quality_versions.find((v) => v.id === 'v3')!.notified_at).toBe('2026-11-11T12:00:00Z')
  })
})
