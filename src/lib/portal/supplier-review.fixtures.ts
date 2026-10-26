import type { PortalCertFact } from './portal-facts'
import type { RejectionDetail } from '@/lib/reports/performance-data'

export const fact = (over: Partial<PortalCertFact> & { id: string }): PortalCertFact => ({
  certificateNumber: `C-${over.id}`,
  contractRef: `K-${over.id}`,
  issuedAt: '2026-10-05T15:00:00Z',
  type: 'pss',
  rejected: false,
  violations: [],
  origin: 'Brazil',
  lab: 'Santos lab',
  seller: 'Cooxupé',
  importer: 'Importer',
  roaster: 'Roaster',
  quality: 'Q',
  crop: null,
  containerNr: null,
  mt: null,
  labSampleId: `lab-${over.id}`,
  ...over,
})

const FAULT = (n: string) => `Fault "${n}": Intensity 3 exceeds maximum (0)`
const PRIMARY = 'Primary defects: 12 exceeds limit (8)'
const SECONDARY = 'Secondary defects: 30 exceeds limit (20)'
const QUAKERS = 'Quakers: 9 exceeds maximum (8)'

const detail = (over: Partial<RejectionDetail>): RejectionDetail => ({
  primaryDefects: [], secondaryDefects: [], faults: [], taints: [], ...over,
})

/** Cooxupé: 10 rejected (4 cup fault, 3 primary, 2 secondary, 1 quakers; two with two reasons) + 30 approved. */
export function cooxupeFixture(): { facts: PortalCertFact[]; details: Map<string, RejectionDetail> } {
  const rejected: [string, string[], RejectionDetail | null, string][] = [
    ['r1', [FAULT('phenolic')], detail({ faults: ['phenolic'] }), '2026-08-03T15:00:00Z'],
    ['r2', [FAULT('phenolic')], detail({ faults: ['phenolic'] }), '2026-09-03T15:00:00Z'],
    ['r3', [FAULT('phenolic')], detail({ faults: ['phenolic', 'ferment'] }), '2026-10-03T15:00:00Z'],
    ['r4', [FAULT('ferment')], detail({ faults: ['ferment'] }), '2026-10-04T15:00:00Z'],
    ['r5', [PRIMARY], detail({ primaryDefects: ['black beans', 'sour'] }), '2026-09-10T15:00:00Z'],
    ['r6', [PRIMARY, QUAKERS], detail({ primaryDefects: ['black beans'] }), '2026-09-11T15:00:00Z'],
    ['r7', [PRIMARY], detail({ primaryDefects: ['black beans'] }), '2026-10-11T15:00:00Z'],
    ['r8', [SECONDARY], detail({ secondaryDefects: ['broken'] }), '2026-09-12T15:00:00Z'],
    ['r9', [SECONDARY, QUAKERS], detail({ secondaryDefects: ['broken'] }), '2026-10-12T15:00:00Z'],
    ['r10', [QUAKERS], null, '2026-10-13T15:00:00Z'],
  ]
  const facts: PortalCertFact[] = rejected.map(([id, violations, , issuedAt]) =>
    fact({ id, rejected: true, violations, issuedAt }))
  const details = new Map<string, RejectionDetail>()
  for (const [id, , d] of rejected) if (d) details.set(`lab-${id}`, d)
  for (let i = 0; i < 30; i++) {
    facts.push(fact({
      id: `a${i}`,
      issuedAt: i < 10 ? '2026-08-20T15:00:00Z' : i < 20 ? '2026-09-20T15:00:00Z' : '2026-10-20T15:00:00Z',
      type: i % 3 === 0 ? 'ss' : 'pss',
      mt: i % 3 === 0 ? 19.25 : null,
    }))
  }
  return { facts, details }
}
