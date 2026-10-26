import { describe, it, expect } from 'vitest'
import { buildOverviewModel, filterPaths, toLatest, toPathRows } from './overview-model'
import { AHOLD, COLOMBIA, DUNKIN, MT_PER_SS, MULTI } from './overview-model.fixtures'
import type { PortalCertFact } from './portal-facts'

describe('buildOverviewModel', () => {
  const m = buildOverviewModel(DUNKIN, {}, 'certificates')

  it('computes KPIs', () => {
    expect(m.kpis).toMatchObject({
      certificates: 564, approved: 459, approvedPct: 81, rejected: 105, pssPct: 70, ssPct: 86,
    })
  })
  it('draws a sankey over the varying steps and tags the scope', () => {
    expect(m.flow.kind).toBe('sankey')
    if (m.flow.kind === 'sankey') expect(m.flow.steps).toEqual(['seller', 'importer', 'roaster'])
    expect(m.tags.map(t => t.label)).toEqual(['Brazil', 'Santos lab', '1 quality'])
    expect(m.tags.every(t => !t.removable)).toBe(true)
  })
  it('node approval rate is a 0-100 percentage', () => {
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    expect(m.flow.nodes.find(n => n.id === 'seller:Sucden Brasil')!.approvalRate).toBe(59)
  })
  it('only links adjacent drawn steps', () => {
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    expect(m.flow.nodes.some(n => n.step === 'origin')).toBe(false)
    expect(m.flow.links.every(l => l.source.split(':')[0] !== l.target.split(':')[0])).toBe(true)
    const l = m.flow.links.find(l => l.source === 'seller:Sucden Brasil' && l.target === 'importer:Coffee America')!
    expect(l.size).toBe(22)
    expect(l.approvalRate).toBe(59)
  })
  it('groups qualities with the PSS/SS split', () => {
    expect(m.qualities).toEqual([
      { quality: 'Dunkin', origin: 'Brazil', lab: 'Santos lab', certificates: 564,
        pssApproved: 114, pssTotal: 163, ssApproved: 345, ssTotal: 401 },
    ])
  })
})

describe('ranking fallback', () => {
  const m = buildOverviewModel(AHOLD, {}, 'certificates')
  it('ranks sellers by wilson lower bound', () => {
    expect(m.flow.kind).toBe('ranking')
    if (m.flow.kind !== 'ranking') return
    expect(m.flow.step).toBe('seller')
    expect(m.flow.rows[0]).toMatchObject({ value: 'Comexim EU', certificates: 51, rejected: 0, approvalRate: 100, fewLots: false })
    expect(m.flow.rows.find(r => r.value === 'Douqué')).toMatchObject({ fewLots: true, certificates: 4 })
    expect(m.flow.rows.find(r => r.value === 'Ecom')).toMatchObject({ rejected: 12, approvalRate: 81 })
  })
  it('tags the single importer', () => {
    expect(m.tags.map(t => t.label)).toContain('Importer: Ahold')
  })
})

describe('multi-origin and filters', () => {
  it('draws all five steps', () => {
    const m = buildOverviewModel(MULTI, {}, 'certificates')
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    expect(m.flow.steps).toEqual(['origin', 'lab', 'seller', 'importer', 'roaster'])
    expect(m.tags.slice(0, 2).map(t => t.label)).toEqual(['2 origins', '2 labs'])
  })
  it('an origin filter collapses origin and lab', () => {
    const m = buildOverviewModel(MULTI, { origin: 'Brazil' }, 'certificates')
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    expect(m.flow.steps).toEqual(['seller', 'importer', 'roaster'])
    expect(m.tags[0]).toEqual({ label: 'Brazil', step: 'origin', removable: true })
  })
  it('a filter matching nothing is empty but keeps its tag', () => {
    const m = buildOverviewModel(MULTI, { seller: 'Nobody' }, 'certificates')
    expect(m.flow.kind).toBe('empty')
    expect(m.kpis).toMatchObject({ certificates: 0, approvedPct: null, pssPct: null, ssPct: null })
    expect(m.tags[0]).toEqual({ label: 'Nobody', step: 'seller', removable: true })
  })
  it('filterPaths narrows by every filter', () => {
    expect(filterPaths(MULTI, { origin: 'Colombia' })).toEqual([COLOMBIA])
  })
})

describe('mt metric', () => {
  it('kpis.mt sums SS only', () => {
    const m = buildOverviewModel(DUNKIN, {}, 'mt')
    expect(m.kpis.mt).toBe(401 * MT_PER_SS)
  })
  it('sizes nodes by SS mt', () => {
    const m = buildOverviewModel(DUNKIN, {}, 'mt')
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    // Sucden Brasil: 16 SS of 22
    expect(m.flow.nodes.find(n => n.id === 'seller:Sucden Brasil')!.size).toBe(160)
    // COCAPEC has 1 SS and 0 PSS
    expect(m.flow.nodes.find(n => n.id === 'seller:COCAPEC')!.size).toBe(10)
  })
  it('drops nodes and links with no SS mt', () => {
    const rows = [...DUNKIN, { ...DUNKIN[0], seller: 'PssOnly', type: 'pss' as const, mt: 0 }]
    const m = buildOverviewModel(rows, {}, 'mt')
    if (m.flow.kind !== 'sankey') throw new Error('sankey expected')
    expect(m.flow.nodes.some(n => n.value === 'PssOnly')).toBe(false)
    expect(m.flow.links.some(l => l.source === 'seller:PssOnly')).toBe(false)
  })
})

const fact = (o: Partial<PortalCertFact>): PortalCertFact => ({
  id: 'x', certificateNumber: null, contractRef: null, issuedAt: '2026-10-01T00:00:00Z', type: 'ss',
  rejected: false, violations: [], origin: 'Brazil', lab: 'Santos lab', seller: 'A', importer: 'B',
  roaster: 'Not recorded', quality: 'Q', crop: null, containerNr: null, mt: 5, labSampleId: 's', ...o,
})

describe('toPathRows / toLatest', () => {
  it('groups facts, counts approvals and sums SS mt with null as 0', () => {
    const rows = toPathRows([
      fact({ id: '1' }), fact({ id: '2', rejected: true, mt: null }), fact({ id: '3', mt: 7 }),
      fact({ id: '4', type: 'pss', mt: 99 }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.type === 'ss')).toMatchObject({ certificates: 3, approved: 2, mt: 12 })
    expect(rows.find(r => r.type === 'pss')).toMatchObject({ certificates: 1, approved: 1, mt: 0 })
  })
  it('lists the newest first and honours the limit', () => {
    const facts = [
      fact({ id: 'old', issuedAt: '2026-01-01T00:00:00Z' }),
      fact({ id: 'new', issuedAt: '2026-10-01T00:00:00Z' }),
      fact({ id: 'mid', issuedAt: '2026-05-01T00:00:00Z' }),
    ]
    expect(toLatest(facts).map(c => c.id)).toEqual(['new', 'mid', 'old'])
    expect(toLatest(facts, 2).map(c => c.id)).toEqual(['new', 'mid'])
  })
})

describe('edge cases', () => {
  it('MT mode with only PSS rows is empty but KPIs keep certificate counts', () => {
    const pssOnly = DUNKIN.filter(r => r.type === 'pss')
    const m = buildOverviewModel(pssOnly, {}, 'mt')
    expect(m.flow.kind).toBe('empty')
    expect(m.kpis.certificates).toBe(163)
    expect(m.kpis.mt).toBe(0)
  })
  it('no rows at all gives an empty model with no tags', () => {
    const m = buildOverviewModel([], {}, 'certificates')
    expect(m.flow.kind).toBe('empty')
    expect(m.tags).toEqual([])
    expect(m.kpis).toEqual({
      certificates: 0, approved: 0, approvedPct: null, rejected: 0, pssPct: null, ssPct: null, mt: 0,
    })
  })
  it('filters on the Not recorded roaster', () => {
    const m = buildOverviewModel(DUNKIN, { roaster: 'Not recorded' }, 'certificates')
    const expected = DUNKIN.filter(r => r.roaster === 'Not recorded')
    expect(expected.length).toBeGreaterThan(0)
    expect(m.kpis.certificates).toBe(expected.reduce((a, r) => a + r.certificates, 0))
    expect(m.tags[0]).toEqual({ label: 'Not recorded', step: 'roaster', removable: true })
  })
})
