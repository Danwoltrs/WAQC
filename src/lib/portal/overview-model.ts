import { wilsonLowerBound } from '@/lib/reports/supplier-ratings'
import { FLOW_STEPS, type FlowStep, type PortalCertFact } from './portal-facts'

export interface PathRow {
  origin: string
  lab: string
  seller: string
  importer: string
  roaster: string
  quality: string
  type: 'pss' | 'ss'
  certificates: number
  approved: number
  /** Summed MT, SS rows only; PSS rows carry 0. */
  mt: number
}

export interface LatestCert {
  id: string
  certificateNumber: string | null
  contractRef: string | null
  type: 'pss' | 'ss'
  origin: string
  lab: string
  seller: string
  importer: string
  roaster: string
  issuedAt: string
  rejected: boolean
}

export type FlowFilters = Partial<Record<FlowStep, string>>
export type OverviewMetric = 'certificates' | 'mt'

export interface ScopeTag { label: string; step?: FlowStep; removable: boolean }
export interface FlowNode { id: string; step: FlowStep; value: string; label: string; size: number; approvalRate: number }
export interface FlowLink { source: string; target: string; size: number; approvalRate: number }
export type FlowModel =
  | { kind: 'sankey'; steps: FlowStep[]; nodes: FlowNode[]; links: FlowLink[] }
  | {
      kind: 'ranking'
      step: FlowStep
      rows: { value: string; label: string; certificates: number; rejected: number; approvalRate: number; fewLots: boolean }[]
    }
  | { kind: 'empty' }

export interface OverviewKpis {
  certificates: number
  approved: number
  approvedPct: number | null
  rejected: number
  pssPct: number | null
  ssPct: number | null
  mt: number
}

export interface QualityRow {
  quality: string
  origin: string
  lab: string
  certificates: number
  pssApproved: number
  pssTotal: number
  ssApproved: number
  ssTotal: number
}

export interface OverviewModel { kpis: OverviewKpis; tags: ScopeTag[]; flow: FlowModel; qualities: QualityRow[] }

const pct = (k: number, n: number): number | null => (n > 0 ? Math.round((k / n) * 100) : null)
const KEY_SEP = '\u0001'

export function toPathRows(facts: PortalCertFact[]): PathRow[] {
  const acc = new Map<string, PathRow>()
  for (const f of facts) {
    const key = [f.origin, f.lab, f.seller, f.importer, f.roaster, f.quality, f.type].join(KEY_SEP)
    let row = acc.get(key)
    if (!row) {
      row = {
        origin: f.origin, lab: f.lab, seller: f.seller, importer: f.importer, roaster: f.roaster,
        quality: f.quality, type: f.type, certificates: 0, approved: 0, mt: 0,
      }
      acc.set(key, row)
    }
    row.certificates += 1
    if (!f.rejected) row.approved += 1
    if (f.type === 'ss') row.mt += f.mt ?? 0
  }
  return [...acc.values()]
}

export function toLatest(facts: PortalCertFact[], limit = 50): LatestCert[] {
  return [...facts]
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0))
    .slice(0, limit)
    .map(f => ({
      id: f.id,
      certificateNumber: f.certificateNumber,
      contractRef: f.contractRef,
      type: f.type,
      origin: f.origin,
      lab: f.lab,
      seller: f.seller,
      importer: f.importer,
      roaster: f.roaster,
      issuedAt: f.issuedAt,
      rejected: f.rejected,
    }))
}

export function filterPaths(rows: PathRow[], filters: FlowFilters): PathRow[] {
  const active = Object.entries(filters).filter(([, v]) => v != null) as [FlowStep, string][]
  return rows.filter(r => active.every(([step, v]) => r[step] === v))
}

const distinct = (rows: PathRow[], step: FlowStep): string[] => [...new Set(rows.map(r => r[step]))]

function buildKpis(rows: PathRow[]): OverviewKpis {
  let certificates = 0, approved = 0, pssN = 0, pssK = 0, ssN = 0, ssK = 0, mt = 0
  for (const r of rows) {
    certificates += r.certificates
    approved += r.approved
    if (r.type === 'pss') { pssN += r.certificates; pssK += r.approved }
    else { ssN += r.certificates; ssK += r.approved; mt += r.mt }
  }
  return {
    certificates, approved, approvedPct: pct(approved, certificates), rejected: certificates - approved,
    pssPct: pct(pssK, pssN), ssPct: pct(ssK, ssN), mt,
  }
}

function buildTags(all: PathRow[], filters: FlowFilters): ScopeTag[] {
  const tags: ScopeTag[] = []
  for (const step of FLOW_STEPS) {
    const v = filters[step]
    if (v != null) tags.push({ label: v, step, removable: true })
  }
  const origins = distinct(all, 'origin')
  if (filters.origin == null && origins.length > 0) {
    tags.push({ label: origins.length === 1 ? origins[0] : `${origins.length} origins`, removable: false })
  }
  const labs = distinct(all, 'lab')
  if (filters.lab == null && labs.length > 0) {
    tags.push({ label: labs.length === 1 ? labs[0] : `${labs.length} labs`, removable: false })
  }
  const importers = distinct(all, 'importer')
  if (filters.importer == null && importers.length === 1) {
    tags.push({ label: `Importer: ${importers[0]}`, removable: false })
  }
  const nq = new Set(all.map(r => r.quality)).size
  if (nq > 0) tags.push({ label: `${nq} ${nq === 1 ? 'quality' : 'qualities'}`, removable: false })
  return tags
}

function buildFlow(rows: PathRow[], metric: OverviewMetric): FlowModel {
  if (rows.length === 0) return { kind: 'empty' }
  const size = (r: PathRow) => (metric === 'mt' ? (r.type === 'ss' ? r.mt : 0) : r.certificates)
  // Varying steps are judged on the rows that carry size in this metric (MT: SS rows with mt > 0).
  const sized = rows.filter(r => size(r) > 0)
  if (sized.length === 0) return { kind: 'empty' }
  const steps = FLOW_STEPS.filter(s => distinct(sized, s).length > 1)

  if (steps.length < 2) {
    const step: FlowStep = steps[0] ?? 'seller'
    const acc = new Map<string, { n: number; k: number }>()
    for (const r of rows) {
      const a = acc.get(r[step]) ?? { n: 0, k: 0 }
      a.n += r.certificates
      a.k += r.approved
      acc.set(r[step], a)
    }
    const list = [...acc.entries()].map(([value, a]) => ({
      value, label: value, certificates: a.n, rejected: a.n - a.k,
      approvalRate: Math.round((a.k / a.n) * 100), fewLots: a.n < 10,
      score: wilsonLowerBound(a.k, a.n),
    }))
    list.sort((x, y) => y.score - x.score || y.certificates - x.certificates || x.value.localeCompare(y.value))
    return { kind: 'ranking', step, rows: list.map(({ score: _s, ...r }) => r) }
  }

  const nodeAcc = new Map<string, { step: FlowStep; value: string; size: number; n: number; k: number }>()
  for (const r of rows) {
    for (const step of steps) {
      const id = `${step}:${r[step]}`
      const a = nodeAcc.get(id) ?? { step, value: r[step], size: 0, n: 0, k: 0 }
      a.size += size(r)
      a.n += r.certificates
      a.k += r.approved
      nodeAcc.set(id, a)
    }
  }
  const nodes: FlowNode[] = [...nodeAcc.entries()]
    .filter(([, a]) => a.size > 0)
    .map(([id, a]) => ({
      // R10: the colour stays the certificate approval rate in MT mode too (n, k count every row).
      id, step: a.step, value: a.value, label: a.value, size: a.size, approvalRate: Math.round((a.k / a.n) * 100),
    }))

  const linkAcc = new Map<string, { source: string; target: string; size: number; n: number; k: number }>()
  for (let i = 0; i < steps.length - 1; i++) {
    for (const r of rows) {
      const source = `${steps[i]}:${r[steps[i]]}`
      const target = `${steps[i + 1]}:${r[steps[i + 1]]}`
      const key = `${source}${KEY_SEP}${target}`
      const a = linkAcc.get(key) ?? { source, target, size: 0, n: 0, k: 0 }
      a.size += size(r)
      a.n += r.certificates
      a.k += r.approved
      linkAcc.set(key, a)
    }
  }
  const links: FlowLink[] = [...linkAcc.values()]
    .filter(a => a.size > 0)
    .map(a => ({ source: a.source, target: a.target, size: a.size, approvalRate: Math.round((a.k / a.n) * 100) }))

  if (nodes.length === 0) return { kind: 'empty' }
  return { kind: 'sankey', steps, nodes, links }
}

function buildQualities(rows: PathRow[]): QualityRow[] {
  const acc = new Map<string, QualityRow>()
  for (const r of rows) {
    const key = [r.quality, r.origin, r.lab].join(KEY_SEP)
    const q = acc.get(key) ?? {
      quality: r.quality, origin: r.origin, lab: r.lab, certificates: 0,
      pssApproved: 0, pssTotal: 0, ssApproved: 0, ssTotal: 0,
    }
    q.certificates += r.certificates
    if (r.type === 'pss') { q.pssApproved += r.approved; q.pssTotal += r.certificates }
    else { q.ssApproved += r.approved; q.ssTotal += r.certificates }
    acc.set(key, q)
  }
  return [...acc.values()].sort((a, b) => b.certificates - a.certificates || a.quality.localeCompare(b.quality))
}

export function buildOverviewModel(rows: PathRow[], filters: FlowFilters, metric: OverviewMetric): OverviewModel {
  const filtered = filterPaths(rows, filters)
  return {
    kpis: buildKpis(filtered),
    tags: buildTags(filtered, filters),
    flow: buildFlow(filtered, metric),
    qualities: buildQualities(filtered),
  }
}
