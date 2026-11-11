import { describe, expect, it } from 'vitest'
import { buildOriginSummary, buildQualityList, sectionCompliance, versionViews } from './portal-qualities'
import type { PortalCertFact } from './portal-facts'
import type { VersionRow } from '@/lib/quality-spec/types'

const fact = (o: Partial<PortalCertFact>): PortalCertFact => ({
  id: 'x', certificateNumber: null, contractRef: null, issuedAt: '2026-10-01T00:00:00Z', type: 'pss',
  rejected: false, violations: [], complianceViolations: [], qualitySpecId: 'q1', origin: 'Brazil', lab: 'Santos lab',
  seller: 'A', importer: 'B', roaster: 'R', quality: 'Q', crop: null, containerNr: null, mt: 1, labSampleId: 's', ...o,
})

const ver = (o: Partial<VersionRow>): VersionRow => ({
  id: 'v1', client_quality_id: 'q1', version_no: 1, effective_from: '2026-01-01',
  spec: { template: { parameters: {} }, custom_parameters: null, cups_per_sample: null, discrepancy_threshold: null },
  source: 'migration', note: null, created_by: null, created_at: '2026-01-01T00:00:00Z', applied_at: '2026-01-01T00:00:00Z',
  notified_at: null, cancelled_at: null, cancelled_by: null, cancel_note: null, ...o,
})

describe('buildQualityList', () => {
  it('groups by origin, lists a quality without certificates, takes scheduled from the pending version', () => {
    const list = buildQualityList(
      [fact({ id: '1' }), fact({ id: '2', rejected: true }), fact({ id: '3', type: 'ss' })],
      [
        { id: 'q2', name: 'Zed', origin: 'Colombia', versions: [ver({ client_quality_id: 'q2' })] },
        { id: 'q1', name: 'GC17', origin: 'Brazil', versions: [ver({}), ver({ id: 'v2', version_no: 2, effective_from: '2026-12-01', applied_at: null })] },
      ],
      '2026-11-11',
    )
    expect(list.map((r) => r.origin)).toEqual(['Brazil', 'Colombia'])
    expect(list[0]).toMatchObject({ versionNo: 1, scheduled: { versionNo: 2, effectiveFrom: '2026-12-01' }, certificates: 3, pssApprovedPct: 50, ssApprovedPct: 100 })
    expect(list[1]).toMatchObject({ certificates: 0, pssApprovedPct: null, ssApprovedPct: null, scheduled: null })
    expect(buildOriginSummary(list).find((o) => o.origin === 'Brazil')).toMatchObject({ qualities: 1, certificates: 3 })
  })
})

describe('sectionCompliance', () => {
  it('counts lots within per section and ignores other qualities', () => {
    const facts = Array.from({ length: 20 }, (_, i) =>
      fact({ id: `c${i}`, rejected: i < 2, complianceViolations: i < 2 ? ['Quakers: 12 exceeds maximum (8)'] : [] }))
    facts.push(fact({ id: 'other', qualitySpecId: 'q9', complianceViolations: ['Quakers: 12 exceeds maximum (8)'] }))
    const s = sectionCompliance(facts, 'q1')
    expect(s.physical).toEqual({ within: 18, lots: 20 })
    expect(s.screen).toEqual({ within: 20, lots: 20 })
    expect(s.green).toBeNull()
  })
})

describe('versionViews', () => {
  const names = new Map([['u1', 'Ana Client']])
  it('names the author by source', () => {
    const v = versionViews([
      ver({ id: 'a', source: 'wolthers' }),
      ver({ id: 'b', version_no: 2, source: 'migration', effective_from: '2026-02-01' }),
      ver({ id: 'c', version_no: 3, source: 'client', created_by: 'u1', effective_from: '2026-03-01' }),
      ver({ id: 'd', version_no: 4, source: 'client', created_by: 'zz', effective_from: '2026-04-01' }),
    ], '2026-11-11', names)
    const by = Object.fromEntries(v.map((x) => [x.id, x]))
    expect(by.a.changedBy).toBe('Wolthers')
    expect(by.b.changedBy).toBe('Wolthers')
    expect(by.c.changedBy).toBe('Ana Client')
    expect(by.d.changedBy).toBe('Client')
    expect(by.d.status).toBe('in_force')
    expect(by.a.status).toBe('past')
  })
  it('shows cancelled and scheduled', () => {
    const v = versionViews([
      ver({}),
      ver({ id: 'x', version_no: 2, cancelled_at: '2026-05-01T00:00:00Z', cancel_note: 'Mistake', applied_at: null, effective_from: '2026-12-01' }),
      ver({ id: 'y', version_no: 3, applied_at: null, effective_from: '2026-12-15' }),
    ], '2026-11-11', new Map())
    expect(v.find((x) => x.id === 'x')).toMatchObject({ status: 'cancelled', cancelNote: 'Mistake' })
    expect(v.find((x) => x.id === 'y')!.status).toBe('scheduled')
    expect(v.find((x) => x.id === 'v1')!.status).toBe('in_force')
  })
})
